<!--
Copyright (c) 2026 the Barq authors
Licensed under the Apache License, Version 2.0. See LICENSE and NOTICE.
-->

# Sync with barq-core

Barq JS gets its synchronization engine from
[barq-core](https://github.com/BarqDB/barq-core). This document describes how the
JavaScript/TypeScript layer binds to it and what the token-based sync model looks
like.

## The token model

Barq does not authenticate users. Your backend (or any identity provider you
trust) issues a **signed access token** whose claims identify a tenant/owner.
You hand that token to Barq:

```ts
const user = Barq.User.fromToken(accessToken, {
  route: "https://sync.example.com", // the Barq server endpoint
  refreshToken,                       // optional
});
```

`Barq.User` is a thin wrapper over barq-core's sync user
(`barq_sync_user_*`). The methods map directly:

| `Barq.User`                          | barq-core C-API                                  |
| ------------------------------------ | ------------------------------------------------ |
| `Barq.User.fromToken(token, opts)`   | `barq_sync_user_new_from_token`                  |
| `user.setRoute(route, verified)`     | `barq_sync_user_set_route`                       |
| `user.setAccessToken(token)`         | `barq_sync_user_set_access_token`                |
| `user.markAccessTokenRefreshRequired()` | `barq_sync_user_mark_access_token_refresh_required` |
| sync config (flexible)               | `barq_sync_user_make_flexible_sync_config`       |

There is no `App`, `Credentials`, login flow, Functions, Push, or MongoDB client
— those Atlas App Services concepts were removed from the fork.

## The native binding

`@barq/barq` is a native module. Its JavaScript ⇄ C++ glue is **generated** from
barq-core's binding spec by the `barq-bindgen` tool (the `bindgen:wrapper` and
`bindgen:jsi` scripts in `packages/realm/package.json`):

```
packages/realm/
  bindgen/
    vendor/barq-core/        <- git submodule: github.com/BarqDB/barq-core
      bindgen/spec.yml       <- the C++ API description consumed by barq-bindgen
    js_spec.yml              <- JS-side additions/overrides
  src/binding/               <- generated wrapper (wrapper.generated.ts)
```

The submodule is declared in [`.gitmodules`](./.gitmodules). Initialise it before
building:

```sh
git submodule update --init --recursive
```

### Build ordering (CI)

Because the wrapper is generated from barq-core, a from-scratch build is:

1. `git submodule update --init` — fetch barq-core.
2. `npm run bindgen:generate:spec-schema` then `npm run bindgen:wrapper` — regenerate
   `src/binding/wrapper.generated.ts` from `barq-core/bindgen/spec.yml`.
3. `npm run prebuild-node` / `prebuild-apple` / `prebuild-android` — compile the
   native prebuilds against barq-core.
4. `npm run build:ts` — type-check and emit the TypeScript layer.

> **Note:** barq-core must carry a `bindgen/spec.yml` describing its C++ surface
> (including the `barq_sync_user_*` entry points) for step 2 to succeed. Keeping
> that spec in sync with barq-core is what "support sync from barq-core" reduces
> to on the native side; the TypeScript layer in this repo is already shaped for
> the token model above.
