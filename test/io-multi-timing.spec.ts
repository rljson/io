// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { exampleTableCfg, TableCfg } from '@rljson/rljson';

import { afterEach, describe, expect, it } from 'vitest';

import { Io, IoMem, IoMulti, IoMultiIo, IoPeer, PeerSocketMock } from '../src';
import { setIoTraceLogger } from '../src/io-trace';

import { DelayedIo } from './helpers/DelayedIo';

/**
 * All tests in this file follow the same realistic lifecycle: every
 * underlying Io is *open* when the IoMulti is constructed and
 * init()'d (so IoMulti.init()'s existing initialization strictness
 * check — unchanged by this work — is satisfied), and only *afterwards*
 * do specific members get closed, simulating a peer dropping out while
 * the IoMulti itself stays open. That mirrors the real scenario this
 * hardening targets: a peer that was fine at startup goes away later.
 */

/** Creates a table with two rows tagged by `prefix`, so results can be
 * traced back to the Io they came from. */
const createExampleTableWithData = async (
  key: string,
  prefix: string,
  io: Io,
) => {
  const tableCfg: TableCfg = exampleTableCfg({ key });
  await io.createOrExtendTable({ tableCfg });
  await io.write({
    data: {
      [key]: {
        _data: [
          { a: `${key}Value${prefix}0`, b: 0 },
          { a: `${key}Value${prefix}1`, b: 1 },
        ],
        _hash: '',
        _type: 'components',
      },
    },
  });
};

/** Creates a table config only, without rows. */
const createEmptyExampleTable = async (key: string, io: Io) => {
  const tableCfg: TableCfg = exampleTableCfg({ key });
  await io.createOrExtendTable({ tableCfg });
};

/** Builds an IoPeer over a PeerSocketMock wrapping a fresh IoMem. */
const createPeer = async (): Promise<{ peer: IoPeer; mem: IoMem }> => {
  const mem = new IoMem();
  await mem.init();
  const socket = new PeerSocketMock(mem);
  const peer = new IoPeer(socket);
  await peer.init();
  return { peer, mem };
};

describe('IoMulti — closed-readable handling and dead-peer timing', () => {
  // ...........................................................................
  describe('(i) dead peer in a priority group does not stall the healthy one', () => {
    it('returns the healthy answer promptly instead of waiting out the dead peer', async () => {
      // Healthy readable: slightly delayed (not instant) so a "the dead
      // peer just happened to lose a race that resolved in the same
      // microtask" false-positive is ruled out.
      const healthyMem = new IoMem();
      await healthyMem.init();
      await createExampleTableWithData('t', 'Healthy', healthyMem);
      const healthy = new DelayedIo(healthyMem, { readRows: 20 });

      // Peer that will go dead: a real IoPeer/PeerSocketMock pair.
      const { peer: dying, mem: dyingMem } = await createPeer();
      await createExampleTableWithData('t', 'Dying', dyingMem);

      const ios: Array<IoMultiIo> = [
        { io: healthy, priority: 1, read: true, write: false, dump: false },
        { io: dying, priority: 1, read: true, write: false, dump: false },
      ];
      const ioMulti = new IoMulti(ios);
      await ioMulti.init(); // both members are still open at this point

      // Now the peer goes away. Closing it disconnects the underlying
      // socket, whose 'disconnect' listener (wired in IoPeer.init())
      // flips isOpen to false — and PeerSocketMock's dead-peer mode
      // makes emit() swallow requests rather than (unrealistically)
      // answering, mirroring a socket that really is gone.
      await dying.close();
      expect(dying.isOpen).toBe(false);

      const start = Date.now();
      const { t } = await ioMulti.readRows({ table: 't', where: {} });
      const elapsedMs = Date.now() - start;

      // Well under the 30s default IoPeer request timeout — proves the
      // dead peer did not have to be waited out.
      expect(elapsedMs).toBeLessThan(2_000);

      expect(t._data.map((r) => (r as any).a).sort()).toEqual([
        'tValueHealthy0',
        'tValueHealthy1',
      ]);
    });
  });

  // ...........................................................................
  describe('(ii) closed readable is skipped and recorded as an error', () => {
    it('throws (does not return a clean empty result) when the only holder is closed', async () => {
      const mem = new IoMem();
      await mem.init();
      await createExampleTableWithData('t', 'A', mem);

      const ioMulti = new IoMulti([
        { io: mem, priority: 1, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await mem.close();
      expect(mem.isOpen).toBe(false);

      await expect(
        ioMulti.readRows({ table: 't', where: {} }),
      ).rejects.toThrow(/closed/);
    });

    it('falls back to "unknown" in the recorded error when the member has no id (IoMulti never init()\'d)', async () => {
      // IoMultiIo.id is only ever assigned by IoMulti.init(). Skipping
      // init() (a pattern already used elsewhere in this suite, e.g.
      // read-rows-by-hashes.spec.ts) exercises the fallback branch of
      // `ioMultiIo.id ?? 'unknown'` in IoMulti._isClosed.
      const mem = new IoMem();
      await mem.init();
      await createExampleTableWithData('t', 'A', mem);
      await mem.close();

      const ioMulti = new IoMulti([
        { io: mem, priority: 1, read: true, write: false, dump: false },
      ]);
      // Deliberately no ioMulti.init() call.

      await expect(
        ioMulti.readRows({ table: 't', where: {} }),
      ).rejects.toThrow('Io "unknown" is closed');
    });

    it('returns rows from another open member when the higher-priority one is closed', async () => {
      const closedMem = new IoMem();
      await closedMem.init();
      await createExampleTableWithData('t', 'Closed', closedMem);

      const openMem = new IoMem();
      await openMem.init();
      await createExampleTableWithData('t', 'Open', openMem);

      const ioMulti = new IoMulti([
        { io: closedMem, priority: 1, read: true, write: false, dump: false },
        { io: openMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await closedMem.close();

      const { t } = await ioMulti.readRows({ table: 't', where: {} });
      expect(t._data.map((r) => (r as any).a).sort()).toEqual([
        'tValueOpen0',
        'tValueOpen1',
      ]);
    });

    it('skips an entire closed priority group and falls through to the next', async () => {
      const closedA = new IoMem();
      await closedA.init();
      await createExampleTableWithData('t', 'ClosedA', closedA);

      const closedB = new IoMem();
      await closedB.init();
      await createExampleTableWithData('t', 'ClosedB', closedB);

      const openMem = new IoMem();
      await openMem.init();
      await createExampleTableWithData('t', 'Open', openMem);

      const ioMulti = new IoMulti([
        { io: closedA, priority: 1, read: true, write: false, dump: false },
        { io: closedB, priority: 1, read: true, write: false, dump: false },
        { io: openMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await closedA.close();
      await closedB.close();

      const { t } = await ioMulti.readRows({ table: 't', where: {} });
      expect(t._data.map((r) => (r as any).a).sort()).toEqual([
        'tValueOpen0',
        'tValueOpen1',
      ]);

      // tableExists must also skip the fully-closed priority-1 group
      // (covers the "whole group skipped, continue" branch) and find
      // the table via the open priority-2 group.
      await expect(ioMulti.tableExists('t')).resolves.toBe(true);
    });
  });

  // ...........................................................................
  describe('(iii) readRowsByHashes with a closed member mid-list', () => {
    it('skips the closed member and still finds hashes held by others', async () => {
      const memFirst = new IoMem();
      await memFirst.init();
      await memFirst.createOrExtendTable({
        tableCfg: exampleTableCfg({ key: 't' }),
      });
      await memFirst.write({
        data: {
          t: { _data: [{ a: 'first', b: 0 }], _hash: '', _type: 'components' },
        },
      });
      const firstDump = (await memFirst.dump()).t;
      const firstHash = (firstDump._data[0] as any)._hash as string;

      // Closed member sits in the middle of the cascade.
      const memClosed = new IoMem();
      await memClosed.init();
      await createEmptyExampleTable('t', memClosed);

      const memLast = new IoMem();
      await memLast.init();
      await memLast.createOrExtendTable({
        tableCfg: exampleTableCfg({ key: 't' }),
      });
      await memLast.write({
        data: {
          t: { _data: [{ a: 'last', b: 1 }], _hash: '', _type: 'components' },
        },
      });
      const lastDump = (await memLast.dump()).t;
      const lastHash = (lastDump._data[0] as any)._hash as string;

      const ioMulti = new IoMulti([
        { io: memFirst, priority: 1, read: true, write: false, dump: false },
        { io: memClosed, priority: 2, read: true, write: false, dump: false },
        { io: memLast, priority: 3, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await memClosed.close();

      const { t } = await ioMulti.readRowsByHashes({
        table: 't',
        hashes: [firstHash, lastHash],
      });

      expect(t._data.map((r) => (r as any).a).sort()).toEqual([
        'first',
        'last',
      ]);
    });
  });

  // ...........................................................................
  describe('(iv) contentType/rawTableCfgs skip a closed first readable', () => {
    it('contentType uses the next open readable', async () => {
      const closedMem = new IoMem();
      await closedMem.init();
      await createEmptyExampleTable('t', closedMem);

      const openMem = new IoMem();
      await openMem.init();
      await createEmptyExampleTable('t', openMem);

      const ioMulti = new IoMulti([
        { io: closedMem, priority: 1, read: true, write: false, dump: false },
        { io: openMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await closedMem.close();

      await expect(ioMulti.contentType({ table: 't' })).resolves.toBe(
        'components',
      );
    });

    it('rawTableCfgs uses the next open readable', async () => {
      const closedMem = new IoMem();
      await closedMem.init();
      await createEmptyExampleTable('closedOnlyTable', closedMem);

      const openMem = new IoMem();
      await openMem.init();
      await createEmptyExampleTable('openTable', openMem);

      const ioMulti = new IoMulti([
        { io: closedMem, priority: 1, read: true, write: false, dump: false },
        { io: openMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await closedMem.close();

      // IoMem auto-registers a couple of internal tables (`tableCfgs`,
      // `revisions`) on init(), so assert on presence/absence rather
      // than an exact array — the point is that the closed member's
      // table is skipped in favor of the open member's.
      const cfgs = await ioMulti.rawTableCfgs();
      const keys = cfgs.map((c) => c.key);
      expect(keys).toContain('openTable');
      expect(keys).not.toContain('closedOnlyTable');
    });
  });

  // ...........................................................................
  describe('(v) every readable closed → meaningful error, not a clean empty result', () => {
    const setupAllClosed = async () => {
      const memA = new IoMem();
      await memA.init();
      await createExampleTableWithData('t', 'A', memA);

      const memB = new IoMem();
      await memB.init();
      await createExampleTableWithData('t', 'B', memB);

      const ioMulti = new IoMulti([
        { io: memA, priority: 1, read: true, write: false, dump: false },
        { io: memB, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await memA.close();
      await memB.close();

      return ioMulti;
    };

    it('readRows throws', async () => {
      const ioMulti = await setupAllClosed();
      await expect(
        ioMulti.readRows({ table: 't', where: {} }),
      ).rejects.toThrow(/closed/);
    });

    it('readRowsByHashes throws', async () => {
      const ioMulti = await setupAllClosed();
      await expect(
        ioMulti.readRowsByHashes({ table: 't', hashes: ['whatever'] }),
      ).rejects.toThrow(/closed/);
    });

    it('tableExists throws (does not return false)', async () => {
      const ioMulti = await setupAllClosed();
      await expect(ioMulti.tableExists('t')).rejects.toThrow(/closed/);
    });

    it('contentType throws', async () => {
      const ioMulti = await setupAllClosed();
      await expect(ioMulti.contentType({ table: 't' })).rejects.toThrow(
        /closed/,
      );
    });

    it('rawTableCfgs throws (does not return an empty array)', async () => {
      const ioMulti = await setupAllClosed();
      await expect(ioMulti.rawTableCfgs()).rejects.toThrow(/closed/);
    });
  });

  // ...........................................................................
  describe('ioTrace wiring into IoMulti.readRows', () => {
    let messages: string[];

    const collectingLogger = (msg: string) => {
      messages.push(msg);
    };

    afterEach(() => {
      setIoTraceLogger(null);
    });

    it('traces a single-readable-group success (breaks the cascade immediately)', async () => {
      messages = [];
      setIoTraceLogger(collectingLogger);

      const mem = new IoMem();
      await mem.init();
      await createExampleTableWithData('t', 'Solo', mem);
      const ioMulti = new IoMulti([
        { io: mem, priority: 1, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      await ioMulti.readRows({ table: 't', where: {} });

      expect(
        messages.some((m) => m.startsWith('IoMulti.readRows table=t')),
      ).toBe(true);
      expect(messages.some((m) => m.includes('size=1 rows=2'))).toBe(true);
    });

    it('traces a single-readable-group error and a multi-readable-group outcome', async () => {
      messages = [];
      setIoTraceLogger(collectingLogger);

      // Priority 1: a single, open readable whose readRows() rejects for
      // a reason unrelated to being closed (isOpen stays true — this is
      // not the closed-skip path, it is a genuine failure).
      const throwingBase = new IoMem();
      await throwingBase.init();
      await createExampleTableWithData('t', 'Unused', throwingBase);
      const throwing: Io = Object.create(throwingBase);
      (throwing as any).readRows = async () => {
        throw new Error('boom');
      };

      // Priority 2: two open readables raced via Promise.allSettled —
      // one has the data.
      const memA = new IoMem();
      await memA.init();
      await createExampleTableWithData('t', 'A', memA);
      const memB = new IoMem();
      await memB.init();
      await createEmptyExampleTable('t', memB);

      const ios: Array<IoMultiIo> = [
        { io: throwing, priority: 1, read: true, write: false, dump: false },
        { io: memA, priority: 2, read: true, write: false, dump: false },
        { io: memB, priority: 2, read: true, write: false, dump: false },
      ];
      const ioMulti = new IoMulti(ios);
      await ioMulti.init();

      const { t } = await ioMulti.readRows({ table: 't', where: {} });
      expect(t._data.length).toBe(2);

      expect(messages.some((m) => m.includes('size=1 error=boom'))).toBe(
        true,
      );
      expect(messages.some((m) => m.includes('size=2 found=true'))).toBe(
        true,
      );
    });
  });
});
