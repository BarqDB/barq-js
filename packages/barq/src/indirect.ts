////////////////////////////////////////////////////////////////////////////
//
// Copyright 2024 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////

import type { Barq } from "./Barq";
import type { Results } from "./Results";
import type { List } from "./List";
import type { Dictionary } from "./Dictionary";
import type { BarqSet } from "./Set";
import type { OrderedCollection } from "./OrderedCollection";
import type { BarqObject } from "./Object";
import type { Collection } from "./Collection";
import type { User } from "./sync/User";

type Indirects = {
  Barq: typeof Barq;
  Collection: typeof Collection;
  OrderedCollection: typeof OrderedCollection;
  Results: typeof Results;
  List: typeof List;
  Dictionary: typeof Dictionary;
  Set: typeof BarqSet;
  Object: typeof BarqObject;
  User: typeof User;
};

/**
 * Values that can be dependent on at runtime without eagerly loading it into the module.
 * Use this as a last resort only to break cyclic imports.
 * @internal
 */
export const indirect = {} as Indirects;

const IGNORED_PROPS = new Set([
  // See https://github.com/BarqDB/barq-js/issues/6522
  "$$typeof",
]);

const THROW_ON_ACCESS_HANDLER: ProxyHandler<object> = {
  get(_target, prop) {
    if (typeof prop === "string" && !IGNORED_PROPS.has(prop)) {
      throw new AccessError(prop);
    }
  },
};

// Setting a prototype which throws if an indirect value gets accessed at runtime before it's injected
Object.setPrototypeOf(indirect, new Proxy({}, THROW_ON_ACCESS_HANDLER));

class AccessError extends Error {
  constructor(name: string) {
    super(`Accessing indirect ${name} before it got injected`);
  }
}

/**
 * Injects a value that can be dependent on at runtime without eagerly loading it into the module.
 * @internal
 */
export function injectIndirect<Name extends keyof typeof indirect>(name: Name, value: (typeof indirect)[typeof name]) {
  Object.defineProperty(indirect, name, {
    value,
    writable: false,
  });
}
