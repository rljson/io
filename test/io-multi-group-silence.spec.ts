// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// .............................................................................
// A GROUP CANNOT PROVE AN ABSENCE WHILE ONE MEMBER IS SILENT — so it must stop
// trying to, rather than wait.
//
// `readRows` races the members of a priority group and takes the first that
// HAS rows (0.0.81). When nobody has them it falls back to
// `Promise.allSettled`, which waits for the slowest — and a member that is
// open but never answers only settles at its own request timeout, 30 s for an
// `IoPeer`. "Nobody has this row" is exactly what a lookup for an unreplicated
// ref is, so this is the common path, not the rare one.
//
// WHAT IT COSTS, measured in `@rljson/fs-agent`: 24–27 reads per gate run
// blocked for a full 10 s (the caller's own timeout), concentrated on whichever
// node was partitioned. Two of them matter most — `ancestryPrevious` and
// `resolveAnnouncement` — because both feed the edit chain's verdict on which
// way two folders disagree. A verdict that does not arrive in time is
// indistinguishable from no history at all, and the anti-entropy then decides
// by inference from a content hash, which that package's own §2.2 proves cannot
// be correct. One wrong inference deletes a file whose author never announced
// it.
//
// So the requirement is not "answer faster". It is **answer or fail, definitely
// and soon**: a caller can retry a failure, and it can degrade on one, but it
// can do nothing useful with a ten-second stall.
//
// THE RULE: a member that has not answered while others have is recorded as a
// FAILURE, not as an absence. The existing classification then does the right
// thing — a fetch by hash that found nothing while something failed throws
// rather than reporting a verified absence, which is the guarantee that must
// not be traded away for the latency.
// .............................................................................

import { Json } from '@rljson/json';
import { exampleTableCfg, TableCfg } from '@rljson/rljson';

import { describe, expect, it } from 'vitest';

import { BATCH_READ_SOURCE_TIMEOUT_MS, Io, IoMem, IoMulti } from '../src';

/** A store that is open and never answers a read. */
const silent = (inner: Io): Io =>
  new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'readRows') return () => new Promise(() => {});
      return Reflect.get(target, prop, receiver);
    },
  }) as Io;

/** A store whose read FAILS, and only after `delayMs`. */
const slowFailure = (inner: Io, delayMs: number): Io =>
  new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== 'readRows') return Reflect.get(target, prop, receiver);
      return () =>
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('this source failed, eventually')),
            delayMs,
          ),
        );
    },
  }) as Io;

/** A store that answers correctly, but only after `delayMs`. */
const slow = (inner: Io, delayMs: number): Io =>
  new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== 'readRows') return Reflect.get(target, prop, receiver);
      return async (...args: unknown[]) => {
        await new Promise((r) => setTimeout(r, delayMs));
        return (
          Reflect.get(target, prop, receiver) as (...a: unknown[]) => unknown
        ).apply(target, args);
      };
    },
  }) as Io;

const withTable = async (prefix: string): Promise<IoMem> => {
  const io = new IoMem();
  await io.init();
  const tableCfg: TableCfg = exampleTableCfg({ key: 't' });
  await io.createOrExtendTable({ tableCfg });
  await io.write({
    data: {
      t: {
        _data: [{ a: `${prefix}0`, b: 0 }],
        _hash: '',
        _type: 'components',
      },
    },
  });
  return io;
};

/** Resolves to `'late'` if `work` has not settled by `ms`. */
const within = async <T>(work: Promise<T>, ms: number): Promise<T | 'late'> => {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<'late'>((r) => {
    timer = setTimeout(() => r('late'), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
};

const DEADLINE = BATCH_READ_SOURCE_TIMEOUT_MS + 3_000;

describe('IoMulti.readRows — a silent member of a group', () => {
  it('does not wait it out when NOBODY has the row', async () => {
    // The case that stalls today. Both members are in one group, neither holds
    // the wanted hash, and one of them never answers.
    const quiet = await withTable('Quiet');
    const other = await withTable('Other');
    const io = new IoMulti([
      { io: silent(quiet), priority: 1, read: true, write: false, dump: false },
      { io: other, priority: 1, read: true, write: false, dump: false },
    ]);
    await io.init();

    const outcome = await within(
      io
        .readRows({ table: 't', where: { _hash: 'nobody-has-this' } })
        .then(() => 'answered' as const)
        .catch(() => 'failed' as const),
      DEADLINE,
    );

    expect(
      outcome,
      'the group waited out a member that never answers',
    ).not.toBe('late');
  }, 20_000);

  it('reports a FAILURE rather than an absence, so nobody reads it as "gone"', async () => {
    // The guarantee that must survive the latency fix. An empty answer to a
    // fetch by hash means "this content does not exist", and a source that
    // never answered makes that unknowable — so it must throw. Reporting
    // absence here is a lie the caller cannot detect, and the one that made a
    // node issue 1 705 body pulls and apply none of them.
    const quiet = await withTable('Quiet');
    const other = await withTable('Other');
    const io = new IoMulti([
      { io: silent(quiet), priority: 1, read: true, write: false, dump: false },
      { io: other, priority: 1, read: true, write: false, dump: false },
    ]);
    await io.init();

    await expect(
      io.readRows({ table: 't', where: { _hash: 'nobody-has-this' } }),
    ).rejects.toThrow();
  }, 20_000);

  it('still answers from the member that HAS the row', async () => {
    // Unchanged from 0.0.81, and the reason the bound is armed at all.
    const holder = await withTable('Holder');
    const { t } = await holder.readRows({ table: 't', where: {} });
    const hash = ((t as { _data: Json[] })._data[0] as { _hash: string })._hash;

    const quiet = await withTable('Quiet');
    const io = new IoMulti([
      { io: silent(quiet), priority: 1, read: true, write: false, dump: false },
      { io: holder, priority: 1, read: true, write: false, dump: false },
    ]);
    await io.init();

    const outcome = await within(
      io.readRows({ table: 't', where: { _hash: hash } }),
      DEADLINE,
    );
    expect(outcome).not.toBe('late');
    expect(
      ((outcome as { t: { _data: Json[] } }).t._data as Json[]).length,
    ).toBe(1);
  }, 20_000);

  it('a SLOW member that holds the row is still waited for', async () => {
    // Slow is not silent — the lesson from `@rljson/bs` 0.0.28, which bounded
    // a source and abandoned one that merely answered late, failing 15 of 91
    // blob tests. A member that answers within the bound must still win, and
    // one that answers late must not be turned into a false absence: the
    // throw above is what covers it.
    const holder = await withTable('Holder');
    const { t } = await holder.readRows({ table: 't', where: {} });
    const hash = ((t as { _data: Json[] })._data[0] as { _hash: string })._hash;

    const quiet = await withTable('Quiet');
    const io = new IoMulti([
      {
        io: slow(holder, Math.floor(BATCH_READ_SOURCE_TIMEOUT_MS / 4)),
        priority: 1,
        read: true,
        write: false,
        dump: false,
      },
      { io: silent(quiet), priority: 1, read: true, write: false, dump: false },
    ]);
    await io.init();

    const outcome = await within(
      io.readRows({ table: 't', where: { _hash: hash } }),
      DEADLINE,
    );
    expect(outcome, 'a member answering inside the bound was abandoned').not.toBe(
      'late',
    );
    expect(
      ((outcome as { t: { _data: Json[] } }).t._data as Json[]).length,
    ).toBe(1);
  }, 20_000);

  it('absorbs a rejection that arrives after the bound gave up on it', async () => {
    // The member is bounded out, the group concludes, and only then does its
    // read fail. That rejection belongs to a question already answered — and
    // an unhandled one takes the process down, which in an agent means the
    // sync dies rather than one read.
    const quiet = await withTable('Quiet');
    const other = await withTable('Other');
    const io = new IoMulti([
      {
        io: slowFailure(quiet, BATCH_READ_SOURCE_TIMEOUT_MS + 400),
        priority: 1,
        read: true,
        write: false,
        dump: false,
      },
      { io: other, priority: 1, read: true, write: false, dump: false },
    ]);
    await io.init();

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      await expect(
        io.readRows({ table: 't', where: { _hash: 'nobody-has-this' } }),
      ).rejects.toThrow();
      // Past the late failure, so it has had its chance to go unhandled.
      await new Promise((r) => setTimeout(r, 900));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled, 'a late rejection escaped').toEqual([]);
  }, 20_000);

  it("names a bounded member 'unknown' when it has no id", async () => {
    // Ids are handed out by `init()`. A multi that was never init()'d has
    // none, and the message has to stay readable — it is what tells somebody
    // which source went quiet.
    const quiet = await withTable('Quiet');
    const other = await withTable('Other');
    // Deliberately NOT initialised.
    const io = new IoMulti([
      { io: silent(quiet), priority: 1, read: true, write: false, dump: false },
      { io: other, priority: 1, read: true, write: false, dump: false },
    ]);

    await expect(
      io.readRows({ table: 't', where: { _hash: 'nobody-has-this' } }),
    ).rejects.toThrow(/unknown/);
  }, 20_000);
});
