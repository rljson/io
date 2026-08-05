// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ioTrace, setIoTraceLogger } from '../src/io-trace';

describe('ioTrace', () => {
  afterEach(() => {
    // Never leak a logger into other test files.
    setIoTraceLogger(null);
  });

  it('does nothing and never builds the message when no logger is installed', () => {
    const messageBuilder = vi.fn(() => 'should not be built');

    expect(() => ioTrace(messageBuilder)).not.toThrow();
    expect(messageBuilder).not.toHaveBeenCalled();
  });

  it('forwards the built message to the installed logger', () => {
    const logger = vi.fn();
    setIoTraceLogger(logger);

    ioTrace(() => 'hello trace');

    expect(logger).toHaveBeenCalledExactlyOnceWith('hello trace');
  });

  it('builds the message lazily — only when a logger is installed', () => {
    const logger = vi.fn();
    setIoTraceLogger(logger);

    const messageBuilder = vi.fn(() => 'lazy message');
    ioTrace(messageBuilder);

    expect(messageBuilder).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledExactlyOnceWith('lazy message');
  });

  it('stops logging once the logger is cleared with null', () => {
    const logger = vi.fn();
    setIoTraceLogger(logger);
    ioTrace(() => 'first');
    expect(logger).toHaveBeenCalledTimes(1);

    setIoTraceLogger(null);
    const messageBuilder = vi.fn(() => 'second');
    ioTrace(messageBuilder);

    expect(messageBuilder).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledTimes(1); // unchanged
  });

  it('switching to a new logger only invokes the new one', () => {
    const first = vi.fn();
    const second = vi.fn();

    setIoTraceLogger(first);
    ioTrace(() => 'to first');
    setIoTraceLogger(second);
    ioTrace(() => 'to second');

    expect(first).toHaveBeenCalledExactlyOnceWith('to first');
    expect(second).toHaveBeenCalledExactlyOnceWith('to second');
  });
});
