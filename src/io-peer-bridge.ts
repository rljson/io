// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';
import { Socket } from './socket.ts';


/**
 * Bridges Socket events to Io method calls.
 *
 * This class listens to socket events and translates them into corresponding
 * Io method calls, automatically registering all Io interface methods.
 */
export class IoPeerBridge {
  private _eventHandlers: Map<string | symbol, (...args: any[]) => void> =
    new Map();

  constructor(private _io: Io, private _socket: Socket) {}

  /**
   * Starts the bridge by setting up connection event handlers and
   * automatically registering all Io methods.
   */
  start(): void {
    this._socket.on('connect', () => this._handleConnect());
    this._socket.on('disconnect', () => this._handleDisconnect());

    // Automatically register all Io interface methods
    this._registerIoMethods();
  }

  /**
   * Stops the bridge by removing all event handlers.
   */
  stop(): void {
    /* v8 ignore next -- @preserve */
    this._socket.off('connect', () => this._handleConnect());
    /* v8 ignore next -- @preserve */
    this._socket.off('disconnect', () => this._handleDisconnect());

    for (const [eventName, handler] of this._eventHandlers) {
      this._socket.off(eventName, handler);
    }
    this._eventHandlers.clear();
  }

  /**
   * Automatically registers all Io interface methods as socket event handlers.
   */
  private _registerIoMethods(): void {
    // Core Io interface methods
    const ioMethods = [
      'init',
      'isReady',
      'close',
      'tableExists',
      'createOrExtendTable',
      'write',
      'readRows',
      'rowCount',
      'dumpTable',
      'dump',
      'contentType',
      'rawTableCfgs',
    ];

    for (const methodName of ioMethods) {
      this.registerEvent(methodName);
    }
  }

  /**
   * Registers a socket event to be translated to an Io method call.
   *
   * @param eventName - The socket event name (should match an Io method name)
   * @param ioMethodName - (Optional) The Io method name if different from eventName
   */
  registerEvent(eventName: string, ioMethodName?: string): void {
    const methodName = ioMethodName || eventName;

    /* v8 ignore next -- @preserve */
    const handler = (...args: any[]) => {
      // The last argument is expected to be a callback function
      const callback = args[args.length - 1];
      const methodArgs = args.slice(0, -1);

      // Get the Io method
      const ioMethod = (this._io as any)[methodName];

      /* v8 ignore next -- @preserve */
      if (typeof ioMethod !== 'function') {
        const error = new Error(
          `Method "${methodName}" not found on Io instance`,
        );
        if (typeof callback === 'function') {
          callback(null, error);
        }
        return;
      }

      // Call the Io method and handle the response
      /* v8 ignore next -- @preserve */
      ioMethod
        .apply(this._io, methodArgs)
        .then((result: any) => {
          if (typeof callback === 'function') {
            // Call callback with just the result (no error parameter when successful)
            callback(result, null); // Two arguments
          }
        })
        .catch((error: any) => {
          if (typeof callback === 'function') {
            // For errors, send null as result and error as second parameter
            callback(null, error); // Two arguments
          }
        });
    };

    this._eventHandlers.set(eventName, handler);
    this._socket.on(eventName, handler);
  }

  /**
   * Registers multiple socket events at once.
   *
   * @param eventNames - Array of event names to register
   */
  registerEvents(eventNames: string[]): void {
    for (const eventName of eventNames) {
      this.registerEvent(eventName);
    }
  }

  /**
   * Unregisters a socket event handler.
   *
   * @param eventName - The event name to unregister
   */
  unregisterEvent(eventName: string | symbol): void {
    const handler = this._eventHandlers.get(eventName);
    if (handler) {
      this._socket.off(eventName, handler);
      this._eventHandlers.delete(eventName);
    }
  }

  /**
   * Emits a result back through the socket.
   *
   * @param eventName - The event name to emit
   * @param data - The data to send
   */
  emitToSocket(eventName: string | symbol, ...data: any[]): void {
    this._socket.emit(eventName, ...data);
  }

  /**
   * Calls an Io method directly and emits the result through the socket.
   *
   * @param ioMethodName - The Io method to call
   * @param socketEventName - The socket event to emit with the result
   * @param args - Arguments to pass to the Io method
   */
  async callIoAndEmit(
    ioMethodName: string,
    socketEventName: string | symbol,
    ...args: any[]
  ): Promise<void> {
    try {
      const ioMethod = (this._io as any)[ioMethodName];

      if (typeof ioMethod !== 'function') {
        throw new Error(`Method "${ioMethodName}" not found on Io instance`);
      }

      const result = await ioMethod.apply(this._io, args);
      this._socket.emit(socketEventName, result, null);
    } catch (error) {
      this._socket.emit(socketEventName, null, error);
    }
  }

  /* v8 ignore next -- @preserve */
  private _handleConnect(): void {
    // Override this method in subclasses to handle connection events
  }

  /* v8 ignore next -- @preserve */
  private _handleDisconnect(): void {
    // Override this method in subclasses to handle disconnection events
  }

  /**
   * Gets the current socket instance.
   */
  get socket(): Socket {
    return this._socket;
  }

  /**
   * Gets the current Io instance.
   */
  get io(): Io {
    return this._io;
  }

  /**
   * Returns whether the socket is currently connected.
   */
  get isConnected(): boolean {
    return this._socket.connected;
  }
}
