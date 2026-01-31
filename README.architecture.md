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

```
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

```
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

```
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

### 4. IoPeerBridge (`io-peer-bridge.ts`)

Server-side handler that bridges socket events to Io operations.

```
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

```
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

- Query readables in priority order (lowest number first)
- Stop at first successful response with data
- If table exists but has 0 rows, continue cascade
- Merge results from multiple sources if needed

**Write Behavior:**

- Write to all writables in parallel
- Hot-swap cache: Successful reads written back to higher priority writables

**Use Cases:**

- Local cache + remote database
- Primary + fallback databases
- Multi-tier data architecture

### 6. IoDbNameMapping (`io-db-name-mapping.ts`)

Provides name mapping between different table name formats.

```
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

```
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

## Data Flow

### Write Operation

```
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

```
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

```
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

- Collect errors from all sources
- Filter out generic "table not found" errors if table exists anywhere
- Throw most specific error available
- If no data found anywhere but table exists: Return empty result

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
