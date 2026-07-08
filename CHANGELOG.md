<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Changelog

## 13.15.0 — Barq JS (initial fork)

Barq JS is forked from the Realm JavaScript SDK at tag `realm-react-v0.20.0`.

### Breaking changes vs. the upstream SDK

- **Rebranded** to Barq. The main package is `@barq/barq` (default export `Barq`),
  and the scoped packages are published under the `@barq` npm org
  (`@barq/react`, `@barq/babel-plugin`, `@barq/common`, `@barq/fetch`,
  `@barq/tools`, `@barq/mocha-reporter`).
- **Removed Atlas / MongoDB / App Services.** The `App`, `Credentials`, email &
  API-key auth providers, Functions, Push, and the MongoDB data-access client
  have been removed. The `realm-web` SDK, the app importer and the BaaS test
  server are gone.
- **Token-based sync.** Synchronization is provided by
  [barq-core](https://github.com/BarqDB/barq-core). A sync user is created from
  a signed access token via `Barq.User.fromToken(...)` — there is no built-in
  login flow. See [SYNC.md](./SYNC.md).
- **No BSON dependency.** The `bson` package has been removed. Value types
  (`ObjectId`, `UUID`, `Decimal128`, `Binary`, `EJSON`) are now Barq's own
  implementations, exposed under `Barq.Types`.
- **Removed telemetry.** All anonymized analytics / metrics collection and the
  `postinstall` phone-home have been removed.

### Compatibility

- Node.js >= 18
- React Native >= 0.71
