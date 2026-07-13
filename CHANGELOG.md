<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Changelog

## 21.3.0 — Vector search

### Enhancements

- Vector search: declare a vector index on a `float` list property via
  `vector: { dimensions, metric, encoding, m, efConstruction, efSearch, buildThreads }`
  in the object schema; the index is a persistent HNSW graph maintained across
  writes and reopens.
- KNN queries via `results.knn(property, queryVector, { k, ef, exact })`,
  composable with filters and sorting.
- Vector index configuration is reconciled at open time; an `efSearch`-only
  change is adopted in place instead of throwing.
- `Barq.Types.Binary` and `Barq.Types.EJSON` are now exported. (These were
  listed under 21.2.0 but did not actually ship until this release.)
- Bundled barq-core v20.2.0.

### Compatibility

- Files containing a vector index must not be opened by `@barqdb/barq` < 21.3.0
  (core < 20.2.0); older versions do not understand the index format.

## 21.2.0 — Barq JS (initial fork)

Barq JS is the initial fork. See NOTICE for upstream attribution.

### Breaking changes vs. the upstream SDK

- **Rebranded** to Barq. The main package is `@barqdb/barq` (default export `Barq`),
  and the scoped packages are published under the `@barqdb` npm org
  (`@barqdb/react`, `@barqdb/babel-plugin`, `@barqdb/common`, `@barqdb/fetch`,
  `@barqdb/tools`, `@barqdb/mocha-reporter`).
- **Removed Barq / Barq / App Services.** The `App`, `Credentials`, email &
  API-key auth providers, Functions, Push, and the Barq data-access client
  have been removed. The `barq-web` SDK, the app importer and the BaaS test
  server are gone.
- **Token-based sync.** Synchronization is provided by
  [barq-core](https://github.com/BarqDB/barq-core). A sync user is created from
  a signed access token via `Barq.User.fromToken(...)` — there is no built-in
  login flow.
- **No Types dependency.** The `types` package has been removed. Value types
  (`ObjectId`, `UUID`, `Decimal128`, `Binary`, `EJSON`) are now Barq's own
  implementations, exposed under `Barq.Types`.
- **Removed telemetry.** All anonymized analytics / metrics collection and the
  `postinstall` phone-home have been removed.

### Compatibility

- Node.js >= 18
- React Native >= 0.71
