<!--
@license
Copyright (c) 2025 Rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# Architecture

## Overview

`@rljson/io` provides a unified abstraction layer for working with RLJSON (Relational JSON) data. The architecture follows a layered approach with multiple implementations of the core `Io` interface, each serving different use cases.

## Core Components

### 1. Io Interface (`io.ts`)

The central abstraction that defines all database operations:

```text
┌─────────────────────────────────────────────┐
│              Io Interface                   │
├─────────────────────────────────────────────┤
│ Lifecycle: init, close, isReady            │
│ Data Ops: write, readRows, dump            │
│ Schema: createOrExtendTable, tableExists   │
│ Metadata: contentType, rowCount, lastUpdate│
└─────────────────────────────────────────────┘
```

**Key Methods:**

- `init()`: Initialize the Io instance
- `write()`: Persist RLJSON data
- `readRows()`: Query data with conditions
- `dump()`: Export complete database state
- `createOrExtendTable()`: Schema evolution
- `tableExists()`: Check table existence

### 2. IoMem (`io-mem.ts`)

In-memory implementation using JavaScript objects.

```text
┌─────────────────────┐
│      IoMem          │
├─────────────────────┤
│ Storage: In-Memory  │
│ Speed: Very Fast    │
│ Persistence: No     │
│ Use Case: Testing   │
│           Caching   │
└─────────────────────┘
```

**Implementation Details:**

- Data stored in `_mem` private property as plain objects
- Synchronous operations wrapped in promises for API consistency
- Uses `@rljson/hash` for data hashing and identity
- `IsReady` pattern for initialization tracking

**Performance internals** (no observable API change):

- Rows are indexed per table by content hash — write dedup is O(1) and
  `readRows` with a string `_hash` in the where clause resolves through
  the index instead of scanning the table
- Table data is kept hash-sorted incrementally (binary-searched insert)
  instead of re-sorting the whole table per write
- Table and global hashes are updated lazily: writes mark tables dirty,
  hashes are recomputed before they become observable (`dump`,
  `dumpTable`, `createOrExtendTable`, re-`init`) — deterministic hashes
  make the refreshed state identical to eager updates
- The latest table configuration and column keys are cached per table
  (updated on create/extend), so validation does not re-scan all
  configurations per read/write

**Data Structure:**

```typescript
_mem = {
  tableName: {
    _type: 'components',  // Content type identifier
    _data: [...rows]      // Array of row objects
  }
}
```

### 3. IoPeer (`io-peer.ts`)

Remote database connection over sockets (Socket.IO compatible).

```text
┌──────────────┐         Socket          ┌──────────────┐
│   IoPeer     │◄───────────────────────►│ IoPeerBridge │
│  (Client)    │     Events/Acks         │   (Server)   │
└──────────────┘                         └──────────────┘
       │                                        │
       │                                        ▼
       │                                  ┌──────────┐
       └─────────── Io Interface ────────┤   Io     │
                                          └──────────┘
```

**Protocol:**

- Emits socket events for each Io operation
- Uses acknowledgment callbacks for responses
- Handles connection lifecycle (connect/disconnect)
- Error propagation through callbacks

**Socket Events:**

- `dump` → dump database
- `readRows` → query with conditions
- `write` → persist data
- `tableExists` → check table
- `createOrExtendTable` → schema operations

**Request timeout & fail-fast on a closed socket:**

Every request method wraps its socket round-trip in `_withTimeout` — if no
ack arrives within `_requestTimeoutMs` (default 30s), the call rejects with
`Timeout after <ms>ms: <operation>`.

Before emitting anything, every request method also checks `this.isOpen`
and rejects **immediately** with `IoPeer: socket closed (<operation>)` when
it is `false`, instead of emitting onto a dead socket and paying the full
30s timeout to find out. `isOpen` is kept in sync by the `connect` /
`disconnect` listeners registered in `init()`. This fail-fast check is
independent of (and a defense-in-depth complement to) `IoMulti`'s own
closed-member skipping described above — it protects any caller of a bare
`IoPeer`, not just ones going through `IoMulti`.

**Batch-read capability latch (`readRowsByHashes`):**

`IoPeer.readRowsByHashes` tries a single batched round-trip first, falling
back to one `readRows` per hash when batching isn't available. Two distinct
"unsupported" signals are handled differently, on purpose:

| Remote signal | Meaning | Latch behavior |
| --- | --- | --- |
| Error includes `'not found on Io instance'` or `'not supported'` | The remote genuinely does not implement batch reads (old server) | **Permanent** — `_batchReadsUnsupported = true`; never tried again for this peer |
| Error includes `'Timeout after'` | The one request timed out — often transient (temporary overload/slow peer), not proof of missing support | **Decaying** — `_batchRetryAfter = Date.now() + 60_000`; this call falls back to per-hash, batch is skipped (not retried) until the window elapses, then tried again |

The decay avoids two failure modes at once: hammering a genuinely
unsupported/overloaded peer with a fresh 30s timeout on every call (no
decay at all), and permanently downgrading a peer to slow per-hash reads
after one transient blip (permanent latch on timeout, the old behavior).

### 4. IoPeerBridge (`io-peer-bridge.ts`)

Server-side handler that bridges socket events to Io operations.

```text
┌─────────────────────────────────────┐
│        IoPeerBridge                 │
├─────────────────────────────────────┤
│  Socket Event → Io Method           │
│                                     │
│  'dump'              → io.dump()    │
│  'readRows'          → io.readRows()│
│  'write'             → io.write()   │
│  'tableExists'       → io.tableExists()│
│  'createOrExtendTable' → io.createOrExtendTable()│
└─────────────────────────────────────┘
```

**Responsibilities:**

- Register socket event listeners
- Forward requests to underlying Io
- Send responses via acknowledgment callbacks
- Handle errors and propagate to client

### 5. IoMulti (`io-multi.ts`)

Aggregates multiple Io instances with priority-based cascading.

```text
┌────────────────────────────────────────────┐
│             IoMulti                        │
├────────────────────────────────────────────┤
│  Readables  (Priority 1, 2, 3...)         │
│  ┌────┐  ┌────┐  ┌────┐                  │
│  │ Io │→ │ Io │→ │ Io │  (Cascade)       │
│  └────┘  └────┘  └────┘                  │
│                                            │
│  Writables (All receive writes)           │
│  ┌────┐  ┌────┐                           │
│  │ Io │  │ Io │  (Parallel)              │
│  └────┘  └────┘                           │
└────────────────────────────────────────────┘
```

**Configuration:**

```typescript
IoMultiIo {
  io: Io           // Underlying Io instance
  priority: number // Lower = higher priority
  read: boolean    // Include in read operations
  write: boolean   // Include in write operations
  dump: boolean    // Use for dump operations
}
```

**Read Behavior:**

- Readables are grouped by priority (`_groupByPriority`); groups are tried in
  ascending priority order, lowest number first
- Within a priority group of more than one readable, all members are queried
  **in parallel** via `Promise.allSettled` — every member in the group is
  awaited, then the **first-non-empty member in group order** wins (not the
  fastest to settle). This keeps results deterministic while still letting
  one slow/rejecting peer in a group not take down the others.
- Stop at the first priority group that produces data
- If a table exists but has 0 rows, continue the cascade to the next
  priority group (see "Bug Fix: Empty Table Cascade" below)
- Merge results from multiple sources if needed (`readRowsByHashes` cascade)

**Closed-member handling (skip-and-record):**

`readRows`, `readRowsByHashes`, `tableExists`, `contentType` and
`rawTableCfgs` all filter out members whose underlying `io.isOpen === false`
**at call time**, before querying them — a readable that dropped its
connection after `IoMulti.init()` is simply not asked. `isOpen` is treated
as "open" unless it is literally `false`, so Io implementations that never
set the flag are unaffected.

A skipped-closed member is not silently dropped — it is **recorded as an
error** in the same error-collection array used for genuine read failures
(`IoMulti._isClosed` / `_skipClosed`). This matters for one specific
situation: if *every* potential holder of a table turns out to be closed,
the call **throws** the recorded "is closed" error instead of returning a
clean empty result (`[]` / `false` / an empty `Rljson`) that would be
indistinguishable from "the table genuinely has no rows" or "the table
does not exist". As soon as at least one open member legitimately answers
(including "not found" / "no rows"), that answer is trusted normally.

`contentType` and `rawTableCfgs` walk `readables` for the first usable
answer; with this change that means the first **open** readable, skipping
past a closed higher-priority one to the next open one.

`dump`/`dumpTable` iterate `dumpables`, not `readables`, and are unaffected
by this change — they already tolerate a missing/erroring member per-source
(dumpTable) or are out of scope for this hardening (dump).

**Write Behavior:**

- Write to all writables in parallel
- Hot-swap cache: Successful reads written back to higher priority writables

**Use Cases:**

- Local cache + remote database
- Primary + fallback databases
- Multi-tier data architecture

### 6. IoDbNameMapping (`io-db-name-mapping.ts`)

Provides name mapping between different table name formats.

```text
┌──────────────────────────────────────┐
│     IoDbNameMapping                  │
├──────────────────────────────────────┤
│  'user_accounts' ↔ 'userAccounts'   │
│  'order_items'   ↔ 'orderItems'     │
└──────────────────────────────────────┘
          │
          ▼
    ┌──────────┐
    │   Io     │
    └──────────┘
```

**Use Case:** Bridging between snake_case database names and camelCase application names.

### 7. IoServer (`io-server.ts`)

Server implementation that combines Socket.IO with Io backends.

```text
┌─────────────────────────────────────┐
│         IoServer                    │
├─────────────────────────────────────┤
│  Socket.IO Server                   │
│       │                             │
│       ▼                             │
│  ┌─────────────────┐                │
│  │  IoPeerBridge   │                │
│  └────────┬────────┘                │
│           │                         │
│           ▼                         │
│      ┌────────┐                     │
│      │  Io    │                     │
│      └────────┘                     │
└─────────────────────────────────────┘
```

**Features:**

- Manages multiple client connections
- Each client gets its own IoPeerBridge
- Can serve shared or isolated Io instances

**Socket lifecycle (`addSocket` / `removeSocket`):**

`addSocket` registers one listener per CRUD event (`_addTransportLayer`)
and keeps the exact handler references it registered, per socket, in a
`Map<Socket, Array<{ event, handler }>>`. `removeSocket` looks up that map
and calls `socket.off(event, handler)` for each one, then forgets the
socket. This is what makes `removeSocket` actually stop a socket from being
served — handlers used to be anonymous arrows with no retained reference,
so nothing could ever unregister them; `removeSocket` only forgot the
socket in its own bookkeeping while the listeners kept firing on it
forever. `removeSocket` is idempotent: removing an already-removed socket,
or one that was never added, is a no-op (no throw).

## Data Flow

### Write Operation

```text
Client Code
    │
    ▼
io.write(data)
    │
    ├──── IoMem ──► Store in _mem object
    │
    ├──── IoPeer ──► Emit 'write' event ──► IoPeerBridge ──► io.write()
    │
    └──── IoMulti ──► Parallel write to all writables
                      │
                      ├──► Cache (IoMem)
                      └──► Remote (IoPeer)
```

### Read Operation (IoMulti Cascade)

```text
io.readRows({table: 'users', where: {id: 1}})
    │
    ▼
Priority 1: Cache (IoMem)
    ├──► Has table, has data ──► Return immediately ✓
    ├──► Has table, no data ──► Continue cascade →
    └──► No table ──► Continue cascade →

Priority 2: Remote (IoPeer)
    ├──► Has table, has data ──► Return + Write to cache ✓
    ├──► Has table, no data ──► Continue cascade →
    └──► No table ──► Continue cascade →

Priority 3+: Additional sources...

No data found anywhere ──► Return empty result or error
```

### Bug Fix: Empty Table Cascade (v0.0.65)

**Problem:** IoMulti stopped querying after finding a readable with the table, even if it returned 0 rows.

**Solution:** Removed early return condition. Now continues cascade when `tableExistsAny=true` but `rows.size=0`.

```typescript
// Before (Bug):
if (!tableExistsAny) {
  throw new Error("Table not found");
} else {
  return rljson; // ❌ Stops even with 0 rows
}

// After (Fixed):
if (!tableExistsAny) {
  throw new Error("Table not found");
}
// Continue loop if rows.size === 0 ✓
return rljson; // Only after loop completes
```

## Socket Communication

### Event-Based Protocol

```text
Client (IoPeer)                    Server (IoPeerBridge)
      │                                    │
      ├─── emit('readRows', request) ────►│
      │                                    │
      │                            [Process Request]
      │                                    │
      │                              io.readRows()
      │                                    │
      │◄──── ack(result, error) ──────────┤
      │                                    │
   Resolve                              Return
  Promise                                Result
```

### Socket Implementations

**SocketMock (`socket-mock.ts`):**

- Single-socket mock for unit testing
- Stores listeners locally
- `emit()` triggers local listeners

**DirectionalSocketMock (`directional-socket-mock.ts`):**

- Bidirectional socket pair
- `emit()` sends to peer socket (not local)
- Critical for client-server testing
- Supports full EventEmitter API:
  - `on()`, `once()`, `off()`
  - `removeAllListeners()`
  - `listenerCount()`, `listeners()`, `eventNames()`

**PeerSocketMock (`peer-socket-mock.ts`):**

- Pre-configured pair for IoPeer/IoPeerBridge testing
- Simulates real Socket.IO behavior
- Automatic connection handling
- **Dead-peer mode:** `emit()` checks `connected` first. When `connected`
  is `false`, the request is swallowed — the ack callback is never
  invoked, simulating a socket whose packets vanish, rather than one that
  (unrealistically) answers instantly regardless of connection state.
  Toggle `connected` for a test via the existing `connect()` /
  `disconnect()` methods. This is what makes it possible to write
  meaningful tests for `IoPeer`'s timeout and fail-fast-on-closed-socket
  behavior against this mock instead of only against hand-rolled sockets.

## Testing Utilities

### IoTestSetup (`io-test-setup.ts`)

Standard interface for test fixtures:

```typescript
interface IoTestSetup {
  io: Io;
  before(): Promise<void>;  // Initialize
  after(): Promise<void>;   // Cleanup
}
```

### Test Patterns

```typescript
// Unit Test (IoMem)
const io = new IoMem();
await io.init();
// ... test operations
await io.close();

// Integration Test (IoPeer + Bridge)
const [clientSocket, serverSocket] = PeerSocketMock.createPeerSocketPair();
const serverIo = new IoMem();
await serverIo.init();

const bridge = new IoPeerBridge(serverSocket, serverIo);
bridge.start();

const clientIo = new IoPeer(clientSocket);
await clientIo.init();
// ... test client operations against server
```

## IoTools (`io-tools.ts`)

Utility functions for working with Io instances:

- **Type merging**: Combine type definitions from multiple sources
- **Data validation**: Verify RLJSON structure
- **Table configuration**: Extract and manipulate TableCfg
- **Content type detection**: Determine table content types

## Design Patterns

### 1. Interface Segregation

All implementations conform to single `Io` interface, making them interchangeable.

### 2. Composite Pattern

`IoMulti` composes multiple Io instances into unified interface.

### 3. Bridge Pattern

`IoPeerBridge` bridges socket events to Io operations.

### 4. Proxy Pattern

`IoDbNameMapping` proxies requests with name translation.

### 5. Strategy Pattern

Different Io implementations provide different storage strategies.

### 6. Observer Pattern

Socket-based implementations use event observers for async communication.

## Error Handling

### Standard Error Flows

```typescript
// Synchronous errors → Rejected promises
try {
  await io.readRows({table: 'users', where: {}});
} catch (error) {
  // Handle table not found, connection errors, etc.
}

// Socket errors → Callback error parameter
socket.emit('readRows', request, (result, error) => {
  if (error) {
    // Handle remote errors
  }
});
```

### IoMulti Error Strategy

- Collect errors from all sources into a single `errors` array
- A closed member (`io.isOpen === false`) that gets skipped instead of
  queried counts as a source of error too — it pushes an `Io "<id>" is
  closed` error into the same array (see `IoMulti._isClosed` /
  `_skipClosed`)
- Filter out generic "table not found" errors if table exists anywhere
- Throw most specific error available
- If no data found anywhere but table exists: Return empty result
- **If every potential holder was closed** (so nothing could be queried at
  all): throw the recorded "is closed" error rather than returning a clean
  empty result — an untouched closed member and a confirmed "no rows" are
  different situations and must not look the same to the caller. This
  applies to `readRows`, `readRowsByHashes`, `tableExists` (throws instead
  of returning `false`) and `rawTableCfgs` (throws instead of returning
  `[]`), in addition to `contentType`.

## Diagnostics: `ioTrace` (`io-trace.ts`)

An injectable, zero-cost-when-disabled trace hook for diagnosing read
amplification and peer-lifecycle issues (e.g. why a hub is being hit far
more often than expected) in a running `IoMulti` + `IoPeer` setup.

```typescript
import { setIoTraceLogger } from '@rljson/io';

// The package itself never reads env vars or writes to stdout — the
// host app decides when tracing is active and wires a logger in.
if (process.env.SL_IO_TRACE) {
  setIoTraceLogger((msg) => console.debug(msg));
}
```

- `setIoTraceLogger(logger | null)` installs (or, with `null`, removes)
  the logger used by `ioTrace`.
- `ioTrace(() => message)` calls the installed logger with the built
  message — the message-building function is only invoked when a logger
  is installed, so call sites can log fairly verbose diagnostics without
  any cost while tracing is disabled (the default).
- Wired into `IoMulti.readRows` (readable/open/group counts on entry, and
  a line per priority group with the row count or error it produced) and
  into `IoPeer.readRows` (`peer readRows-> table=...` on request start,
  `peer readRows<- rows=<n>` or `peer readRows<- err=<message>` on
  settlement) — the two places most relevant to diagnosing hub read
  amplification. Intentionally not wired into every method, to keep the
  hook's surface (and its performance impact when enabled) minimal.

## Performance Considerations

### IoMem

- **Pros:** Instant access, no I/O overhead
- **Cons:** Memory limited, no persistence
- **Best For:** Testing, caching, temporary data

### IoPeer

- **Pros:** Distributed, scalable, persistent
- **Cons:** Network latency, connection overhead
- **Best For:** Client-server apps, microservices

### IoMulti

- **Pros:** Combines benefits of multiple sources, hot-swap caching
- **Cons:** Overhead of managing multiple instances
- **Best For:** Production apps needing performance + reliability

## Version History

### v0.0.73 (peer-lifecycle-hardening)

- **Fix:** `IoMulti` (`readRows`, `readRowsByHashes`, `tableExists`,
  `contentType`, `rawTableCfgs`) now skips readables that are closed
  (`io.isOpen === false`) at call time instead of querying them; a skip is
  recorded as an error so an all-closed situation throws a meaningful
  error instead of returning a clean empty result
- **Fix:** `IoPeer` request methods fail fast with `IoPeer: socket closed
  (<operation>)` when `isOpen` is `false`, instead of emitting onto a dead
  socket and waiting out the full 30s request timeout
- **Change:** `IoPeer.readRowsByHashes`'s batch-capability latch now
  distinguishes a genuine "unsupported" signal (permanent latch, as
  before) from a timeout (transient — falls back for that call only, then
  retries batch reads after a 60s decay window) — a timeout no longer
  permanently downgrades a peer to per-hash reads
- **Fix:** `IoServer.removeSocket` actually unregisters the socket's CRUD
  listeners now (previously a no-op beyond internal bookkeeping); it is
  idempotent
- **Feature:** `PeerSocketMock` gained a dead-peer mode — `emit()`
  swallows requests (never acks) while `connected` is `false`
- **Feature:** New injectable trace hook (`setIoTraceLogger` / `ioTrace`,
  exported from the package root) wired into `IoMulti.readRows` and
  `IoPeer.readRows`, for diagnosing read amplification in production

### v0.0.65

- **Fix:** IoMulti.readRows() cascade now continues when table exists but returns 0 rows
- **Feature:** Added DirectionalSocketMock with full EventEmitter API
- **Breaking:** Socket.off() listener parameter is now optional

### Earlier Versions

See [CHANGELOG.md](CHANGELOG.md) for complete history.

## Future Architecture

### Potential Enhancements

- Connection pooling for IoPeer
- Transaction support across IoMulti
- Query optimization and caching strategies
- Streaming support for large datasets
- Compression for socket communication
- Authentication and authorization layers
