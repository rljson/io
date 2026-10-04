// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Json } from '@rljson/json';
import { exampleTableCfg, TableCfg } from '@rljson/rljson';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BATCH_READ_SOURCE_TIMEOUT_MS,
  Io,
  IoMem,
  IoMulti,
  IoMultiIo,
  IoPeer,
  PeerSocketMock,
} from '../src';
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
  // (i-b) THE PEER THAT IS STILL OPEN AND SIMPLY NEVER ANSWERS.
  //
  // (i) above covers the peer that can be SEEN to be gone: closing it flips
  // `isOpen` to false, so `_skipClosed` drops it before the read and the
  // healthy member answers at once. This is the other half, and it is the one
  // that happens in the field: a half-open TCP socket, a firewall that drops
  // without resetting, a peer under load. `isOpen` stays TRUE, nothing can be
  // skipped, and the request simply never comes back.
  //
  // `readRows` awaited `Promise.allSettled` over the group, so the group was
  // only as fast as its slowest member — which for a silent peer means
  // `IoPeer`'s request timeout, 30 s by default, on EVERY read that reaches
  // that priority. `server.ts` records the same thing measured on the lab
  // against a cloud store at priority 2: *"a read the LAN could answer in
  // milliseconds instead takes as long as the cloud does, or times out …
  // files that were sitting on a peer two metres away never arrived, because
  // the hub was waiting on a continent."* Moving the cloud to priority 3
  // sidestepped it; this is the cause.
  //
  // Traced from the other end in `@rljson/fs-agent`, where one gagged socket
  // in a four-node mesh blocked thirteen reads in a single test and a node
  // never learned of a file a connected peer had just announced.
  // ...........................................................................
  describe('(i-b) an OPEN readable that never answers does not stall its group', () => {
    it('answers from the healthy member instead of waiting the silent one out', async () => {
      const healthyMem = new IoMem();
      await healthyMem.init();
      await createExampleTableWithData('t', 'Healthy', healthyMem);
      // Delayed rather than instant, so a pass cannot come from the healthy
      // member simply having resolved in the same microtask.
      const healthy = new DelayedIo(healthyMem, { readRows: 20 });

      const silentMem = new IoMem();
      await silentMem.init();
      await createExampleTableWithData('t', 'Silent', silentMem);
      const silent = new DelayedIo(silentMem, { readRows: Infinity });

      const ioMulti = new IoMulti([
        { io: healthy, priority: 1, read: true, write: false, dump: false },
        { io: silent, priority: 1, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      // THE POINT: it is not detectably gone. Nothing may be skipped.
      expect(silent.isOpen).toBe(true);

      // Raced against a deadline rather than left to the suite's timeout, so
      // a regression fails in two seconds with a sentence rather than hanging.
      const read = ioMulti.readRows({ table: 't', where: {} }).then((r) => ({
        rows: (r.t as { _data: Json[] })._data,
      }));
      const outcome = await Promise.race([
        read,
        new Promise<{ late: true }>((resolve) =>
          setTimeout(() => resolve({ late: true }), 2_000),
        ),
      ]);

      expect(
        'rows' in outcome,
        'the read waited for a member that is open but never answers',
      ).toBe(true);
      expect(
        ((outcome as { rows: Json[] }).rows as { a: string }[])
          .map((r) => r.a)
          .sort(),
      ).toEqual(['tValueHealthy0', 'tValueHealthy1']);
    });
  });

  // ...........................................................................
  // (i-c) THE OTHER SIDE OF THE RACE: nobody in the group has rows.
  //
  // The race above resolves on the first member WITH rows. When no member has
  // any, it has to fall through to every member's outcome instead — because an
  // empty answer is only trustworthy when nothing failed, which is the rule
  // the cascade applies below. This pins that path: the table exists on both
  // members, neither holds the row, nothing failed, so an empty answer is the
  // honest one and must not be an error.
  // ...........................................................................
  describe('(i-c) a group where no member has rows answers empty, not an error', () => {
    it('reports the table as present and the rows as absent', async () => {
      const first = new IoMem();
      await first.init();
      await createEmptyExampleTable('t', first);

      const second = new IoMem();
      await second.init();
      await createEmptyExampleTable('t', second);

      const ioMulti = new IoMulti([
        { io: first, priority: 1, read: true, write: false, dump: false },
        { io: second, priority: 1, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      const { t } = await ioMulti.readRows({ table: 't', where: {} });
      expect(t._data).toEqual([]);
      // The type still comes back, which is how a caller tells "the table is
      // there and empty" from "the table is missing".
      expect(t._type).toBe('components');
    });
  });

  // ...........................................................................
  // (i-d) THE BATCH READ: a silent source must not block the sources after it.
  //
  // `readRowsByHashes` walks the readables SEQUENTIALLY, narrowing the list of
  // hashes still wanted as it goes — that ordering is load-bearing, so it is
  // not grouped and raced like `readRows`. The cost was that a source which is
  // open and never answers blocked every source behind it for its full request
  // timeout, 30 s by default.
  //
  // It is the path a TREE fetch takes (`@rljson/db`'s tree-controller calls
  // `readRowsByHashes`), which is why it mattered: in `@rljson/fs-agent` a
  // node resolved a peer's announcement, lifted its tombstone, and then sat in
  // the tree fetch while a cut peer timed out — the file arrived only when the
  // window was widened to 120 s.
  //
  // The rule is conservative: a source is bounded only while a FALLBACK
  // exists. The last readable is never bounded, because there is nobody else
  // to ask — so a cloud store at the end of the cascade keeps exactly the
  // behaviour it had.
  // ...........................................................................
  describe('(i-d) a silent source in a batch read does not block the ones behind it', () => {
    it('answers from the later source instead of waiting the silent one out', async () => {
      const silentMem = new IoMem();
      await silentMem.init();
      await createExampleTableWithData('t', 'Silent', silentMem);
      const silent = new DelayedIo(silentMem, { readRowsByHashes: Infinity });

      const holderMem = new IoMem();
      await holderMem.init();
      await createExampleTableWithData('t', 'Holder', holderMem);
      const holder = new DelayedIo(holderMem, { readRowsByHashes: 20 });

      // Which hashes to ask for — taken from the holder's own rows.
      const { t: holderTable } = await holderMem.readRows({
        table: 't',
        where: {},
      });
      const hashes = (holderTable as { _data: Json[] })._data.map(
        (r) => (r as { _hash: string })._hash,
      );

      const ioMulti = new IoMulti([
        // The silent one FIRST, so the sequential walk hits it before the
        // source that can actually answer.
        { io: silent, priority: 1, read: true, write: false, dump: false },
        { io: holder, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();
      expect(silent.isOpen).toBe(true);

      const read = ioMulti
        .readRowsByHashes({ table: 't', hashes })
        .then((r) => ({ rows: (r.t as { _data: Json[] })._data }));
      // The claim is NOT "instant" — it is "does not wait out the source's
      // request timeout", which for an `IoPeer` is 30 s by default. The bound
      // is `BATCH_READ_SOURCE_TIMEOUT_MS`, so the deadline here sits above
      // that and well below 30 s.
      const outcome = await Promise.race([
        read,
        new Promise<{ late: true }>((resolve) =>
          setTimeout(
            () => resolve({ late: true }),
            BATCH_READ_SOURCE_TIMEOUT_MS + 3_000,
          ),
        ),
      ]);

      expect(
        'rows' in outcome,
        'the batch read waited for a source that never answers',
      ).toBe(true);
      expect((outcome as { rows: Json[] }).rows.length).toBe(hashes.length);
    }, 20_000);
  });

  // ...........................................................................
  // (i-f) SLOW IS NOT SILENT.
  //
  // The bound above exists so a source that never answers cannot hold the
  // cascade. It must not also decide that a source which answered LATE had
  // nothing — a batch read walks sources sequentially, and the one holding the
  // rows may simply be the far one.
  //
  // `@rljson/bs` shipped the same bound and lost a working read to it within a
  // day: a blob only one client held, fetched over a socket through the hub,
  // took longer than two seconds on a loaded CI runner and the cascade gave up
  // with the data reachable. Fifteen of ninety-one tests failed once the bound
  // was forced to bite. The rule both packages now hold: **the bound decides
  // who is asked FIRST, never who is believed.**
  // ...........................................................................
  describe('(i-f) a slow source is set aside, not abandoned', () => {
    /**
     * The slow source is the ONLY holder, and it is not last — so it is
     * bounded, and the cascade has to come back to it.
     */
    const buildSlowOnlyHolder = async (delayMs: number) => {
      const holderMem = new IoMem();
      await holderMem.init();
      await createExampleTableWithData('t', 'Holder', holderMem);
      const slow = new DelayedIo(holderMem, { readRowsByHashes: delayMs });

      const { t: holderTable } = await holderMem.readRows({
        table: 't',
        where: {},
      });
      const hashes = (holderTable as { _data: Json[] })._data.map(
        (r) => (r as { _hash: string })._hash,
      );

      // A fallback that is open and has the table but NOT the rows. Its
      // presence is what arms the bound on the source above it.
      const emptyMem = new IoMem();
      await emptyMem.init();
      await createEmptyExampleTable('t', emptyMem);

      const ioMulti = new IoMulti([
        { io: slow, priority: 1, read: true, write: false, dump: false },
        { io: emptyMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();
      return { ioMulti, hashes };
    };

    it('still returns rows only the slow source holds', async () => {
      const { ioMulti, hashes } = await buildSlowOnlyHolder(
        BATCH_READ_SOURCE_TIMEOUT_MS + 1_500,
      );
      const { t } = await ioMulti.readRowsByHashes({ table: 't', hashes });
      expect(
        (t as { _data: Json[] })._data.length,
        'the rows were available and the read gave up on them',
      ).toBe(hashes.length);
    }, 30_000);

    it('still prefers a fallback that CAN answer over waiting', async () => {
      // The guarantee (i-d) added must survive: when somebody else has the
      // rows, the slow source is not waited for.
      const slowMem = new IoMem();
      await slowMem.init();
      await createExampleTableWithData('t', 'Slow', slowMem);
      const slow = new DelayedIo(slowMem, { readRowsByHashes: 20_000 });

      const holderMem = new IoMem();
      await holderMem.init();
      await createExampleTableWithData('t', 'Holder', holderMem);
      const { t: holderTable } = await holderMem.readRows({
        table: 't',
        where: {},
      });
      const hashes = (holderTable as { _data: Json[] })._data.map(
        (r) => (r as { _hash: string })._hash,
      );

      const ioMulti = new IoMulti([
        { io: slow, priority: 1, read: true, write: false, dump: false },
        { io: holderMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      const started = Date.now();
      const { t } = await ioMulti.readRowsByHashes({ table: 't', hashes });
      expect((t as { _data: Json[] })._data.length).toBe(hashes.length);
      expect(
        Date.now() - started,
        'waited for the slow source although a fallback had the rows',
      ).toBeLessThan(BATCH_READ_SOURCE_TIMEOUT_MS + 3_000);
    }, 30_000);

    it('reports a verified absence once the set-aside source has answered too', async () => {
      // Set aside is not suspicion. When the far source finally answers and
      // says it does not have the row either, every readable has now been
      // asked and answered — so an empty result is the TRUE one, and throwing
      // would invent a failure nobody had. Before the set-aside pass existed
      // this threw, because the bound's own error counted as "a source that
      // could not be asked".
      const slowMem = new IoMem();
      await slowMem.init();
      await createExampleTableWithData('t', 'Slow', slowMem);
      const slow = new DelayedIo(slowMem, {
        readRowsByHashes: BATCH_READ_SOURCE_TIMEOUT_MS + 1_000,
      });

      const emptyMem = new IoMem();
      await emptyMem.init();
      await createEmptyExampleTable('t', emptyMem);

      const ioMulti = new IoMulti([
        { io: slow, priority: 1, read: true, write: false, dump: false },
        { io: emptyMem, priority: 2, read: true, write: false, dump: false },
      ]);
      await ioMulti.init();

      const { t } = await ioMulti.readRowsByHashes({
        table: 't',
        hashes: ['missing-hash'],
      });
      expect((t as { _data: Json[] })._data.length).toBe(0);
    }, 30_000);
  });

  // ...........................................................................
  // (i-e) The two other ways a batch source can answer.
  // ...........................................................................
  describe('(i-e) a batch source that answers EMPTY, and one with no id', () => {
    it('moves on when a source holds the table but none of the hashes', () => {
      // Not every miss is a failure: a peer may legitimately have the table
      // and not the rows. That is a normal answer and the cascade continues
      // to the next source rather than recording an error.
      return (async () => {
        const emptyMem = new IoMem();
        await emptyMem.init();
        await createEmptyExampleTable('t', emptyMem);

        const holderMem = new IoMem();
        await holderMem.init();
        await createExampleTableWithData('t', 'Holder', holderMem);

        const { t: holderTable } = await holderMem.readRows({
          table: 't',
          where: {},
        });
        const hashes = (holderTable as { _data: Json[] })._data.map(
          (r) => (r as { _hash: string })._hash,
        );

        const ioMulti = new IoMulti([
          { io: emptyMem, priority: 1, read: true, write: false, dump: false },
          { io: holderMem, priority: 2, read: true, write: false, dump: false },
        ]);
        await ioMulti.init();

        const { t } = await ioMulti.readRowsByHashes({ table: 't', hashes });
        expect((t as { _data: Json[] })._data.length).toBe(hashes.length);
      })();
    });

    it("names a bounded source 'unknown' when it has no id", async () => {
      // Ids are handed out by `IoMulti.init()`. A multi that was never
      // init()'d therefore has none, and the message has to stay readable —
      // the same rule as the recorded-error case above.
      //
      // This is also the one test that waits out
      // `BATCH_READ_SET_ASIDE_TIMEOUT_MS`, which is why it takes ten seconds
      // rather than two: the silent source is set aside, the empty one cannot
      // complete the batch, and the cascade then gives the silent source its
      // last word before concluding. A source that answers NEVER must still
      // end the read — the set-aside pass is bounded for exactly that.
      const silentMem = new IoMem();
      await silentMem.init();
      await createExampleTableWithData('t', 'Silent', silentMem);
      const silent = new DelayedIo(silentMem, { readRowsByHashes: Infinity });

      const emptyMem = new IoMem();
      await emptyMem.init();
      await createEmptyExampleTable('t', emptyMem);

      // Deliberately NOT init()'d, so neither readable carries an id.
      const ioMulti = new IoMulti([
        { io: silent, priority: 1, read: true, write: false, dump: false },
        { io: emptyMem, priority: 2, read: true, write: false, dump: false },
      ]);

      // Nobody can supply the hash, so the batch throws — and the error it
      // throws is the bounded source's, naming it.
      await expect(
        ioMulti.readRowsByHashes({ table: 't', hashes: ['missing-hash'] }),
      ).rejects.toThrow(/unknown/);
    }, 20_000);
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
