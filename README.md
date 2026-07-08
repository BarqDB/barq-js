<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Barq JS

Barq is an offline-first object database for JavaScript and React Native, with
optional synchronization powered by [barq-core](https://github.com/BarqDB/barq-core).

Barq JS is a modified fork of the [Realm JavaScript SDK](https://github.com/realm/realm-js).
It keeps the fast, reactive local database and reshapes synchronization around
**barq-core's token-based sync users** — there is no Atlas, no MongoDB client,
and no bundled BSON dependency. See [NOTICE](./NOTICE) for fork attribution.

## Packages

| npm package            | Path                       | Description                                   |
| ---------------------- | -------------------------- | --------------------------------------------- |
| `@barq/barq`           | `packages/realm`           | The core database SDK (native, binds barq-core) |
| `@barq/react`          | `packages/realm-react`     | React / React Native hooks and providers      |
| `@barq/babel-plugin`   | `packages/babel-plugin`    | Babel plugin for schema-from-class syntax     |
| `@barq/common`         | `packages/realm-common`    | Cross-package shared utilities                |
| `@barq/fetch`          | `packages/fetch`           | Minimal fetch abstraction                     |
| `@barq/tools`          | `packages/realm-tools`     | Developer tooling                             |
| `@barq/mocha-reporter` | `packages/mocha-reporter`  | Mocha reporter used by the test suites        |

## Install

```sh
npm install @barq/barq
# React Native hooks:
npm install @barq/react
```

## Quick start (local database)

```ts
import { Barq } from "@barq/barq";

class Task extends Barq.Object<Task> {
  _id!: Barq.Types.ObjectId;
  description!: string;
  done = false;

  static schema: Barq.ObjectSchema = {
    name: "Task",
    primaryKey: "_id",
    properties: {
      _id: "objectId",
      description: "string",
      done: { type: "bool", default: false },
    },
  };
}

const barq = await Barq.open({ schema: [Task] });
barq.write(() => {
  barq.create(Task, { _id: new Barq.Types.ObjectId(), description: "Ship Barq" });
});
```

## Sync with barq-core

Barq does not perform authentication itself. Obtain a signed access token from
your own identity provider, build a token-based sync user, and open a synced
database:

```ts
import { Barq } from "@barq/barq";

const user = Barq.User.fromToken(accessToken, { route: "https://sync.example.com" });

const barq = await Barq.open({
  schema: [Task],
  sync: { user, flexible: true },
});

// Flexible-sync subscriptions
await barq.subscriptions.update((mutable) => {
  mutable.add(barq.objects(Task));
});
```

Value types (`ObjectId`, `UUID`, `Decimal128`, `Binary`) are provided by Barq
under `Barq.Types` — see [`packages/realm/src/types`](./packages/realm/src/types).

## Data types

Barq ships its own value types (no third-party BSON dependency):

- `Barq.Types.ObjectId`
- `Barq.Types.UUID`
- `Barq.Types.Decimal128`
- `Barq.Types.Binary`
- `Barq.Types.EJSON`

## Building the native module

The `@barq/barq` native module is generated from and linked against
[barq-core](https://github.com/BarqDB/barq-core), vendored as a submodule at
`packages/realm/bindgen/vendor/barq-core`. See [SYNC.md](./SYNC.md) for how the
JavaScript layer binds to barq-core's sync engine.

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
