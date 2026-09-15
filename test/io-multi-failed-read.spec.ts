// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { exampleTableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { Io, IoMem, IoMulti, serializableError } from '../src';

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

  it('a readable that rejects with NOTHING still reports a failure', async () => {
    // `IoPeer.isReady()` rejects with a bare `Promise.reject()` — no value at
    // all — and a rejection with no value has no `.message`. Classifying it
    // threw `Cannot read properties of undefined (reading 'includes')` from
    // inside the cascade, so one offline peer failed the whole read with a
    // TypeError naming neither the table nor the layer.
    //
    // On the lab that surfaced as a node which had just been told about a ref
    // and could not fetch the tree behind it, reporting
    // `No tree nodes found for e2eFileTree@wNVEQejv…` — a message that blames
    // the data for a fault in the reader. It was the last thing standing
    // between a ref crossing the EventHub and the file following it.
    const silent = {
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: () => Promise.reject(),
      readRowsByHashes: () => Promise.reject(),
    } as unknown as Io;

    await expect(
      multiWith(silent).readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow(/failed without a reason/);
    await expect(
      multiWith(silent).readRows({ table, where: { _hash: 'nowhere' } }),
    ).rejects.toThrow(/failed without a reason/);
  });

  it('a table-not-found that crossed a socket is STILL not a failure', async () => {
    // The shape that comes back through an `IoServer`/`IoPeerBridge` ack: a
    // plain object, because `Error.message` is not enumerable and the real
    // Error did not survive.
    //
    // This is the case that changed behaviour rather than only readability.
    // `_realFailures` recognises a benign miss BY MESSAGE, so a
    // `Table "x" not found` stripped of its text reads as a hard failure — and
    // a fetch-by-hash throws it. On the lab a node could not read a tree that
    // had just crossed the cloud, and reported `No tree nodes found`, blaming
    // the data for a fault in the transport.
    const overSocket = {
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: () =>
        Promise.reject({ message: `Table "${table}" not found`, name: 'Error' }),
      readRowsByHashes: () =>
        Promise.reject({ message: `Table "${table}" not found`, name: 'Error' }),
    } as unknown as Io;

    const multi = multiWith(overSocket);
    const result = await multi.readRowsByHashes({ table, hashes: ['nowhere'] });
    expect(result[table]._data).toEqual([]);
    const rows = await multi.readRows({ table, where: { _hash: 'nowhere' } });
    expect(rows[table]._data).toEqual([]);
  });

  it('a REAL failure that crossed a socket still says what it was', async () => {
    const overSocket = {
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: () => Promise.reject({ message: 'socket closed' }),
      readRowsByHashes: () => Promise.reject({ message: 'socket closed' }),
    } as unknown as Io;

    await expect(
      multiWith(overSocket).readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow(/socket closed/);
  });

  it('a readable that rejects with a plain value says what it was', async () => {
    // Not every non-Error rejection is empty. A string or a code is still the
    // only thing the caller has to go on, so it is carried through rather than
    // flattened into "no reason".
    const rude = {
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: () => Promise.reject('ECONNRESET'),
      readRowsByHashes: () => Promise.reject('ECONNRESET'),
    } as unknown as Io;

    await expect(
      multiWith(rude).readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow(/ECONNRESET/);

    // An object with no message at all still beats `[object Object]`, which is
    // what every caller saw before.
    const opaque = {
      isOpen: true,
      init: async () => {},
      close: async () => {},
      isReady: async () => {},
      readRows: () => Promise.reject({ code: 42 }),
      readRowsByHashes: () => Promise.reject({ code: 42 }),
    } as unknown as Io;
    await expect(
      multiWith(opaque).readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow(/\{"code":42\}/);

    // And when the layer has a name, the message uses it — "Io \"cloud\"
    // failed" is a place to look; "a readable failed" is not.
    const named = new IoMulti([
      { io: healthy, priority: 1, read: true, write: false, dump: true },
      { io: rude, id: 'cloud', priority: 2, read: true, write: false, dump: false },
    ]);
    await expect(
      named.readRowsByHashes({ table, hashes: ['nowhere'] }),
    ).rejects.toThrow(/Io "cloud" failed: ECONNRESET/);
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

/**
 * `serializableError` — what an Error becomes when it has to cross a socket.
 */
describe('serializableError', () => {
  it('keeps the message and name of a real Error', () => {
    const e = new TypeError('nope');
    expect(serializableError(e)).toEqual({ message: 'nope', name: 'TypeError' });
  });

  it('carries a message off a plain object', () => {
    expect(serializableError({ message: 'already flat', name: 'Error' })).toEqual({
      message: 'already flat',
      name: 'Error',
    });
    expect(serializableError({ message: 'no name' })).toEqual({
      message: 'no name',
    });
  });

  it('renders an object that has no message as its JSON', () => {
    // Better than `[object Object]`, which is what every caller saw before.
    expect(serializableError({ code: 42 })).toEqual({ message: '{"code":42}' });
  });

  it('renders anything else as text', () => {
    expect(serializableError('ECONNRESET')).toEqual({ message: 'ECONNRESET' });
    expect(serializableError(undefined)).toEqual({ message: 'undefined' });
  });
});
