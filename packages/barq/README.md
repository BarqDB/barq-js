<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# @barq/barq

The core [Barq](https://github.com/BarqDB/barq-js) database SDK for JavaScript
and TypeScript — an offline-first object database for Node.js, Electron and
React Native, with optional synchronization powered by
[barq-core](https://github.com/BarqDB/barq-core).

`@barq/barq` is a modified fork of the `realm` package from the Realm JavaScript
SDK. See the top-level [NOTICE](../../NOTICE) for fork attribution.

## Install

```sh
npm install @barq/barq
```

## Usage

```ts
import { Barq } from "@barq/barq";

class Task extends Barq.Object<Task> {
  _id!: Barq.Types.ObjectId;
  description!: string;

  static schema: Barq.ObjectSchema = {
    name: "Task",
    primaryKey: "_id",
    properties: { _id: "objectId", description: "string" },
  };
}

const barq = await Barq.open({ schema: [Task] });
```

- Value types (`ObjectId`, `UUID`, `Decimal128`, `Binary`) live under `Barq.Types`.

## License

Apache License 2.0. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
