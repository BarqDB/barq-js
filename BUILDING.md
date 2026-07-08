<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Building Barq JS

## Prerequisites

```sh
git submodule update --init --recursive   # fetches barq-core
```

barq-core (the native engine) is vendored as a submodule at
`packages/barq/bindgen/vendor/barq-core` and carries the code-generation
`bindgen/` project (spec + generator) that the SDK binding is produced from.

## The native `@barqdb/barq` addon

The JavaScript ⇄ C++ binding is generated, then compiled:

1. **Generate the binding** from barq-core's `bindgen/spec.yml` and the SDK
   templates in `packages/barq/bindgen`:
   ```sh
   npm run bindgen:wrapper -w @barqdb/barq   # -> src/binding/wrapper.generated.ts
   npm run bindgen:jsi     -w @barqdb/barq   # -> binding/jsi/jsi_init.cpp
   ```
2. **Compile the native module** (node) linking barq-core:
   ```sh
   npm run build:node -w @barqdb/barq        # cmake-js -> prebuilds/node/barq.node
   ```
3. **Build the TypeScript layer**:
   ```sh
   npm run build:ts -w @barqdb/barq
   ```

## CI

The [Build workflow](.github/workflows/build.yml) runs on every push / PR:

| Job | What it does |
| --- | --- |
| **engine** | Compiles barq-core's `Storage` library from the submodule. |
| **datatypes** | Strict `tsc` + round-trip tests for the Barq value types. |
| **napi** | Generates the binding and compiles the native `barq.node` addon on Linux. |

The [Release workflow](.github/workflows/release.yml) publishes the `@barqdb/*`
packages to npm on a `v*` tag, building native prebuilds for the addon.

## Value types

Barq ships its own value types under `Barq.Types` — `ObjectId`, `UUID`,
`Decimal128`, `Binary`, `EJSON` — with no third-party value-type dependency.
See [`packages/barq/src/types`](./packages/barq/src/types).
