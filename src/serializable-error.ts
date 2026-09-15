// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/** An error, in a shape that survives a socket. */
export interface SerializableError {
  /** What went wrong. */
  message: string;
  /** The error's constructor name, when it had one. */
  name?: string;
}

/**
 * An error in a shape that survives a socket.
 *
 * `Error.message` and `Error.stack` are NOT enumerable, so an `Error` handed to
 * a Socket.IO ack arrives at the far side as `{}` — and every layer above it
 * then reports `[object Object]`, or worse, `Cannot read properties of
 * undefined`.
 *
 * That is not only unreadable, it changes behaviour. `IoMulti` classifies its
 * collected failures BY MESSAGE, and the one it has to recognise is
 * `Table "x" not found` — the ordinary answer from a layer that does not serve
 * a table, which must not count as a failure. Stripped of its text, that benign
 * miss reads as a hard failure and a fetch-by-hash throws it. Measured on the
 * lab: a node could not read a tree that had just crossed the cloud and
 * reported `No tree nodes found for e2eFileTree@…`, blaming the data for a
 * fault in the transport.
 *
 * The stack is deliberately NOT carried: it names paths on another machine, it
 * is the largest part of the payload, and the message is what every caller
 * actually branches on.
 * @param error - Whatever was thrown.
 * @returns A plain object that still says what happened.
 */
export const serializableError = (error: unknown): SerializableError => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  if (typeof error === 'object' && error !== null) {
    const bag = error as { message?: unknown; name?: unknown };
    if (typeof bag.message === 'string') {
      return {
        message: bag.message,
        ...(typeof bag.name === 'string' ? { name: bag.name } : {}),
      };
    }
    return { message: JSON.stringify(error) };
  }
  return { message: String(error) };
};
