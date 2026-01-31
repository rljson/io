# @rljson/io

Low-level interface for reading and writing RLJSON data. This package provides a unified abstraction layer for working with RLJSON databases, supporting in-memory storage, remote connections, and multi-source data aggregation.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Overview](#api-overview)
- [Implementations](#implementations)
- [Usage Examples](#usage-examples)
- [Testing Utilities](#testing-utilities)
- [TypeScript Support](#typescript-support)

## Installation

```bash
npm install @rljson/io
# or
pnpm add @rljson/io
# or
yarn add @rljson/io
```

## Quick Start

```typescript
import { IoMem } from '@rljson/io';

// Create an in-memory database
const io = new IoMem();
await io.init();

// Create table schema
await io.createOrExtendTable({
  tableCfg: {
    key: 'users',
    type: 'components',
    columns: [
      { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
      { key: 'id', type: 'number', titleShort: 'ID', titleLong: 'User ID' },
      { key: 'name', type: 'string', titleShort: 'Name', titleLong: 'Name' }
    ],
    isHead: false,
    isRoot: false,
    isShared: true
  }
});

// Write data
await io.write({
  data: {
    users: {
      _type: 'components',
      _data: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
    }
  }
});

// Query data
const result = await io.readRows({
  table: 'users',
  where: { id: 1 }
});
```

## Core Concepts

### Io Interface

The `Io` interface is the core abstraction that defines a standard set of operations for working with RLJSON data:

- **Lifecycle Management**: `init()`, `close()`, `isReady()`
- **Data Operations**: `write()`, `readRows()`, `dump()`
- **Schema Management**: `createOrExtendTable()`, `tableExists()`, `rawTableCfgs()`
- **Metadata**: `contentType()`, `rowCount()`, `lastUpdate()`

All implementations (in-memory, remote, multi-source) conform to this interface.

### RLJSON Format

RLJSON (Relational JSON) is a structured data format that combines JSON with relational database concepts:

```typescript
{
  tableName: {
    _type: 'components',   // Content type identifier
    _data: [...rows]       // Array of data objects
  }
}
```

## API Overview

### Lifecycle

```typescript
// Initialize the Io instance
await io.init();

// Check if ready
await io.isReady();

// Check if open
if (io.isOpen) {
  // Perform operations
}

// Close when done
await io.close();
```

### Writing Data

```typescript
await io.write({
  data: {
    products: {
      _type: 'components',
      _data: [
        { sku: 'ABC123', name: 'Widget', price: 29.99 },
        { sku: 'XYZ789', name: 'Gadget', price: 49.99 }
      ]
    }
  }
});
```

### Reading Data

```typescript
// Query with conditions
const users = await io.readRows({
  table: 'users',
  where: { active: true, role: 'admin' }
});

// Get row count
const count = await io.rowCount('users');

// Check if table exists
const exists = await io.tableExists('users');

// Get last update timestamp
const timestamp = await io.lastUpdate('users');
```

### Dumping Data

```typescript
// Dump entire database
const allData = await io.dump();

// Dump specific table
const tableData = await io.dumpTable({ table: 'users' });
```

### Schema Management

```typescript
// Create or extend a table
await io.createOrExtendTable({
  tableCfg: {
    key: 'orders',
    type: 'components',
    columns: [
      { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
      { key: 'orderId', type: 'number', titleShort: 'Order ID', titleLong: 'Order ID' },
      { key: 'customerId', type: 'number', titleShort: 'Customer', titleLong: 'Customer ID' },
      { key: 'total', type: 'number', titleShort: 'Total', titleLong: 'Total Amount' },
      { key: 'status', type: 'string', titleShort: 'Status', titleLong: 'Order Status' }
    ],
    isHead: false,
    isRoot: false,
    isShared: true
  }
});

// Get table configurations
const configs = await io.rawTableCfgs();

// Get content type
const contentType = await io.contentType({ table: 'orders' });
```

## Implementations

### IoMem - In-Memory Storage

Fast, synchronous in-memory database implementation. Perfect for testing, caching, or small datasets.

```typescript
import { IoMem } from '@rljson/io';

const io = new IoMem();
await io.init();
```

**Use Cases:**

- Unit testing
- Temporary data storage
- Fast prototyping
- Client-side caching

### IoPeer - Remote Connection

Connect to a remote RLJSON database over a socket connection (Socket.IO compatible).

```typescript
import { IoPeer } from '@rljson/io';
import { io as socketClient } from 'socket.io-client';

const socket = socketClient('http://localhost:3000');
const io = new IoPeer(socket);
await io.init();
```

**Use Cases:**

- Distributed applications
- Client-server architectures
- Real-time data synchronization
- Microservices communication

### IoMulti - Multi-Source Aggregation

Combine multiple Io instances with priority-based cascading. Supports read/write splitting and hot-swap caching.

```typescript
import { IoMulti, IoMem, IoPeer } from '@rljson/io';

const cache = new IoMem();
await cache.init();

const remote = new IoPeer(socket);
await remote.init();

const io = new IoMulti([
  { io: cache, priority: 1, read: true, write: true, dump: false },
  { io: remote, priority: 2, read: true, write: true, dump: true }
]);
await io.init();

// Reads cascade: cache first (priority 1), then remote (priority 2)
// Writes go to both cache and remote
// Cache is automatically updated with remote data (hot-swapping)
```

**Use Cases:**

- Performance optimization with caching layers
- Multi-tier data storage
- Fallback mechanisms
- Distributed data aggregation

**Key Features:**

- **Priority-based cascading**: Higher priority sources are queried first
- **Hot-swap caching**: Successful reads are written back to cache layers
- **Flexible capabilities**: Each source can be read-only, write-only, or both
- **Automatic table merging**: Results from multiple sources are merged intelligently

### IoPeerBridge - Server-Side Handler

Bridge between Socket events and Io operations. Used on the server to handle client requests.

```typescript
import { IoPeerBridge, IoMem } from '@rljson/io';
import { Server } from 'socket.io';

const io = new Server(3000);
const db = new IoMem();
await db.init();

io.on('connection', (socket) => {
  const bridge = new IoPeerBridge(socket, db);
  bridge.start();

  socket.on('disconnect', () => {
    bridge.stop();
  });
});
```

## Usage Examples

### Example 1: Simple In-Memory Database

```typescript
import { IoMem } from '@rljson/io';

async function simpleExample() {
  const io = new IoMem();
  await io.init();

  // Create a table
  await io.createOrExtendTable({
    tableCfg: {
      key: 'tasks',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        { key: 'id', type: 'number', titleShort: 'ID', titleLong: 'Task ID' },
        { key: 'title', type: 'string', titleShort: 'Title', titleLong: 'Task Title' },
        { key: 'completed', type: 'boolean', titleShort: 'Done', titleLong: 'Completed' }
      ],
      isHead: false,
      isRoot: false,
      isShared: true
    }
  });

  // Insert data
  await io.write({
    data: {
      tasks: {
        _type: 'components',
        _data: [
          { id: 1, title: 'Learn RLJSON', completed: true },
          { id: 2, title: 'Build app', completed: false }
        ]
      }
    }
  });

  // Query incomplete tasks
  const incompleteTasks = await io.readRows({
    table: 'tasks',
    where: { completed: false }
  });

  console.log(incompleteTasks);
  // { tasks: { _type: 'components', _data: [{ id: 2, title: 'Build app', completed: false }] } }

  await io.close();
}
```

### Example 2: Client-Server Architecture

**Server:**

```typescript
import { IoMem, IoPeerBridge } from '@rljson/io';
import { Server } from 'socket.io';

const ioServer = new Server(3000, {
  cors: { origin: '*' }
});

const db = new IoMem();
await db.init();

// Create table schema
await db.createOrExtendTable({
  tableCfg: {
    key: 'products',
    type: 'components',
    columns: [
      { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
      { key: 'id', type: 'number', titleShort: 'ID', titleLong: 'Product ID' },
      { key: 'name', type: 'string', titleShort: 'Name', titleLong: 'Product Name' },
      { key: 'price', type: 'number', titleShort: 'Price', titleLong: 'Price' }
    ],
    isHead: false,
    isRoot: false,
    isShared: true
  }
});

// Pre-populate with data
await db.write({
  data: {
    products: {
      _type: 'components',
      _data: [{ id: 1, name: 'Widget', price: 10 }]
    }
  }
});

ioServer.on('connection', (socket) => {
  const bridge = new IoPeerBridge(socket, db);
  bridge.start();

  socket.on('disconnect', () => bridge.stop());
});
```

**Client:**

```typescript
import { IoPeer } from '@rljson/io';
import { io as socketClient } from 'socket.io-client';

const socket = socketClient('http://localhost:3000');
const io = new IoPeer(socket);
await io.init();

// Query remote database
const products = await io.readRows({
  table: 'products',
  where: {}
});

console.log(products);
await io.close();
```

### Example 3: Multi-Tier with Cache

```typescript
import { IoMulti, IoMem, IoPeer } from '@rljson/io';
import { io as socketClient } from 'socket.io-client';

// Local cache
const cache = new IoMem();
await cache.init();

// Remote database
const socket = socketClient('http://localhost:3000');
const remote = new IoPeer(socket);
await remote.init();

// Create table schema in both cache and remote
const tableCfg = {
  key: 'users',
  type: 'components',
  columns: [
    { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
    { key: 'id', type: 'number', titleShort: 'ID', titleLong: 'User ID' },
    { key: 'name', type: 'string', titleShort: 'Name', titleLong: 'Name' }
  ],
  isHead: false,
  isRoot: false,
  isShared: true
};

await cache.createOrExtendTable({ tableCfg });
await remote.createOrExtendTable({ tableCfg });

// Combined multi-tier Io
const io = new IoMulti([
  {
    io: cache,
    priority: 1,      // Check cache first
    read: true,
    write: true,      // Write to cache
    dump: false
  },
  {
    io: remote,
    priority: 2,      // Fallback to remote
    read: true,
    write: true,      // Also write to remote
    dump: true        // Remote is source of truth for dumps
  }
]);
await io.init();

// First read hits remote, caches result
const data1 = await io.readRows({
  table: 'users',
  where: { id: 1 }
});

// Second read hits cache (faster!)
const data2 = await io.readRows({
  table: 'users',
  where: { id: 1 }
});

// Writes go to both cache and remote
await io.write({
  data: {
    users: {
      _type: 'components',
      _data: [{ id: 2, name: 'Charlie' }]
    }
  }
});

await io.close();
```

## Testing Utilities

### SocketMock

Mock socket for testing without real network connections.

```typescript
import { SocketMock } from '@rljson/io';

const socket = new SocketMock();
socket.on('test', (data) => console.log(data));
socket.emit('test', 'hello');
```

### DirectionalSocketMock

Bidirectional socket pair for client-server testing.

```typescript
import { createSocketPair } from '@rljson/io';

const [clientSocket, serverSocket] = createSocketPair();

// Server listens
serverSocket.on('request', (data, callback) => {
  callback({ result: 'success' });
});

// Client sends
clientSocket.emit('request', { query: 'data' }, (response) => {
  console.log(response); // { result: 'success' }
});
```

### PeerSocketMock

Mock socket pair for testing IoPeer/IoPeerBridge interactions.

```typescript
import { PeerSocketMock, IoPeer, IoPeerBridge, IoMem } from '@rljson/io';

const [clientSocket, serverSocket] = PeerSocketMock.createPeerSocketPair();

const serverDb = new IoMem();
await serverDb.init();

const bridge = new IoPeerBridge(serverSocket, serverDb);
bridge.start();

const clientIo = new IoPeer(clientSocket);
await clientIo.init();

// Client can now interact with server
const data = await clientIo.dump();
```

### IoTestSetup

Standard test setup interface for creating test fixtures.

```typescript
import { IoTestSetup } from '@rljson/io';

class MyTestSetup implements IoTestSetup {
  constructor(public io: Io) {}

  async before() {
    await this.io.init();
  }

  async after() {
    await this.io.close();
  }
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  Io,
  IoMultiIo,
  Socket
} from '@rljson/io';

// All interfaces are fully typed
const ios: IoMultiIo[] = [
  {
    io: myIo,
    priority: 1,
    read: true,
    write: true,
    dump: false
  }
];
```

## Advanced Features

### Database Name Mapping

Map table names between different representations:

```typescript
import { IoDbNameMapping } from '@rljson/io';

const mapping = new IoDbNameMapping(underlyingIo, {
  'user_accounts': 'userAccounts',
  'order_items': 'orderItems'
});

// Access with either name
await mapping.readRows({ table: 'userAccounts', where: {} });
await mapping.readRows({ table: 'user_accounts', where: {} });
```

### IoTools

Utility functions for working with Io instances:

```typescript
import { IoTools } from '@rljson/io';

// Validate table configurations
const isValid = IoTools.validateTableCfg(tableCfg);

// Merge RLJSON data
const merged = IoTools.mergeRljson(data1, data2);

// Extract type information
const types = IoTools.extractTypes(rljsonData);
```

## API Reference

For detailed API documentation, see the TypeScript definitions or visit the [API docs](https://github.com/rljson/io).

## Example

See [src/example.ts](src/example.ts) for more examples.

## Contributing

See [README.contributors.md](README.contributors.md) for development guidelines.

## License

MIT © [Rljson](https://github.com/rljson)
