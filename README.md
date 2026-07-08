<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Barq JS

[![License](https://img.shields.io/github/license/BarqDB/barq-js)](./LICENSE)
![Status](https://img.shields.io/badge/status-alpha-f7c948)
![TypeScript](https://img.shields.io/badge/TypeScript-SDK-3178c6)
![React Native](https://img.shields.io/badge/React%20Native-ready-23c483)

Barq is an offline-first object database for JavaScript and React Native, with
optional synchronization powered by [barq-core](https://github.com/BarqDB/barq-core).

Barq JS is a modified fork of the [Barq JavaScript SDK](https://github.com/barq/barq-js).
It keeps the fast, reactive local database and reshapes synchronization around
**barq-core's token-based sync users** — there is no Barq, no Barq client,
and no bundled Types dependency. See [NOTICE](./NOTICE) for fork attribution.

## Packages

| npm package            | Path                       | Description                                   |
| ---------------------- | -------------------------- | --------------------------------------------- |
| `@barqdb/barq`           | `packages/barq`           | The core database SDK (native, binds barq-core) |
| `@barqdb/react`          | `packages/react`     | React / React Native hooks and providers      |
| `@barqdb/babel-plugin`   | `packages/babel-plugin`    | Babel plugin for schema-from-class syntax     |
| `@barqdb/common`         | `packages/common`    | Cross-package shared utilities                |
| `@barqdb/fetch`          | `packages/fetch`           | Minimal fetch abstraction                     |
| `@barqdb/tools`          | `packages/tools`     | Developer tooling                             |
| `@barqdb/mocha-reporter` | `packages/mocha-reporter`  | Mocha reporter used by the test suites        |

## Install

```sh
npm install @barqdb/barq
# React Native hooks:
npm install @barqdb/react
```

## Quick start (local database)

```ts
import { Barq } from "@barqdb/barq";

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
import { Barq } from "@barqdb/barq";

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
under `Barq.Types` — see [`packages/barq/src/types`](./packages/barq/src/types).

## Data types

Barq ships its own value types (no third-party Types dependency):

- `Barq.Types.ObjectId`
- `Barq.Types.UUID`
- `Barq.Types.Decimal128`
- `Barq.Types.Binary`
- `Barq.Types.EJSON`


## Building

CI builds the barq-core native engine and the Barq value types on every push. See [BUILDING.md](./BUILDING.md) for the build matrix and the status of the native `@barqdb/barq` addon.

## Roadmap

- Stabilize the `@barqdb/*` package surface
- Publish React Native examples that are easy to run
- Keep native builds aligned with barq-core releases
- Improve docs for token-based sync users

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
