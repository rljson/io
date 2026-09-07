// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { exampleTableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { Io, IoMem, IoMulti } from '../src';

/**
 * A readable that FAILED is not a readable that had nothing.
 *
 * The cascade used to collect its errors and then drop them, so a peer whose
 * socket had gone answered as "no such row". A caller pulling document bodies
 * by content hash cannot tell that from "already gone": on the fleet a node
 * whose peer socket had dropped issued 1 705 body pulls and applied none of
 * them, while the hub held every document.
 */
describe('IoMulti — a failed read is not an empty one', () => {
  const table = 'readableTable';
  let healthy: IoMem;

  /** A readable that cannot answer, the way a dropped socket cannot. */
  const broken = (message: string): Io =>
    ({
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: async () => {
        throw new Error(message);
      },
      readRowsByHashes: async () => {
        throw new Error(message);
      },
    }) as unknown as Io;

  const multiWith = (failing: Io): IoMulti =>
    new IoMulti([
      { io: healthy, priority: 1, read: true, write: false, dump: true },
      { io: failing, priority: 2, read: true, write: false, dump: false },
    ]);

  beforeEach(async () => {
    healthy = new IoMem();
    await healthy.init();
    await healthy.createOrExtendTable({ tableCfg: exampleTableCfg({ key: table }) });
  });

  it('readRowsByHashes reports the failure instead of an empty result', async () => {
    const multi = multiWith(broken('Timeout after 30000ms: readRowsByHashes'));
    await expect(
      multi.readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow('Timeout after 30000ms');
  });

  it('a fetch by hash reports the failure instead of an empty result', async () => {
    const multi = multiWith(broken('socket closed'));
    await expect(
      multi.readRows({ table, where: { _hash: 'nowhere' } }),
    ).rejects.toThrow('socket closed');
  });

  it('an ordinary query still answers empty, even next to a failure', async () => {
    // A query on any other column asks a different question, and empty is a
    // normal answer to it. Callers issue those constantly — making one flaky
    // readable turn every single one into an exception would trade a narrow,
    // proven fault for a wide, unmeasured one.
    const multi = multiWith(broken('socket closed'));
    const result = await multi.readRows({ table, where: { a: 'nowhere' } });
    expect(result[table]._data).toEqual([]);
  });

  it('a closed readable is a failure too', async () => {
    const closed = broken('unused');
    (closed as unknown as { isOpen: boolean }).isOpen = false;
    await expect(
      multiWith(closed).readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow('is closed');
  });

  it('a readable that simply does not serve the table is NOT a failure', async () => {
    // Normal in a cascade, and it says nothing about whether the row exists
    // elsewhere — so an empty answer here is the truth, not a guess.
    const multi = multiWith(broken(`Table "${table}" not found`));
    const result = await multi.readRowsByHashes({ table, hashes: ['nowhere'] });
    expect(result[table]._data).toEqual([]);
    const rows = await multi.readRows({ table, where: { _hash: 'nowhere' } });
    expect(rows[table]._data).toEqual([]);
  });

  it('a failure alongside a complete answer is not reported', async () => {
    // Everything asked for was found, so nothing is unknown.
    await healthy.write({ data: { [table]: { _data: [{ a: 'x', b: 1 }] } } } as never);
    const dump = await healthy.dumpTable({ table });
    const hash = (dump[table]._data[0] as { _hash: string })._hash;
    const multi = multiWith(broken('Timeout after 30000ms'));
    const result = await multi.readRowsByHashes({ table, hashes: [hash] });
    expect((result[table]._data[0] as { _hash: string })._hash).toBe(hash);
  });
});
