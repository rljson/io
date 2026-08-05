// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// ...........................................................................
/**
 * Currently installed trace logger, or `null` when tracing is disabled.
 *
 * This module intentionally never reads environment variables or writes
 * to stdout itself. Host applications decide whether tracing is active
 * (e.g. gated behind an env var such as `SL_IO_TRACE`) and wire a
 * logger in via {@link setIoTraceLogger}.
 */
let traceLogger: ((msg: string) => void) | null = null;

// ...........................................................................
/**
 * Installs the trace logger used by {@link ioTrace}, or clears it when
 * called with `null`.
 * @param logger - Callback invoked with each trace message, or `null` to disable tracing.
 */
export const setIoTraceLogger = (logger: ((msg: string) => void) | null): void => {
  traceLogger = logger;
};

// ...........................................................................
/**
 * Emits a trace message when a logger has been installed.
 *
 * The message is built lazily: `messageBuilder` is only invoked when a
 * logger is active, so call sites can afford reasonably verbose
 * diagnostics without any cost when tracing is disabled (the default).
 * @param messageBuilder - Lazily produces the trace message.
 */
export const ioTrace = (messageBuilder: () => string): void => {
  if (traceLogger) {
    traceLogger(messageBuilder());
  }
};
