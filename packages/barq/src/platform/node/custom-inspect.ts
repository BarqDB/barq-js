////////////////////////////////////////////////////////////////////////////
//
// Copyright 2023 Realm Inc.
// Copyright (c) 2026 the Barq authors
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

import type { InspectOptionsStylized } from "node:util";
import { inspect } from "node:util";

import { Collection } from "../../Collection";
import { Dictionary } from "../../Dictionary";
import { List } from "../../List";
import { BarqSet } from "../../Set";
import { Results } from "../../Results";
import { BarqObject } from "../../Object";

type CustomInspectFunction<T> = (this: T, depth: number, options: InspectOptionsStylized) => void;

function injectInspect<T extends object>(constructor: { prototype: T }, customInspect: CustomInspectFunction<T>) {
  Object.assign(constructor.prototype, { [inspect.custom]: customInspect });
}

function constructorName(value: object) {
  if (value instanceof BarqObject) {
    return value.objectSchema().name;
  } else if (value instanceof BarqSet) {
    return "Barq.Set";
  } else if (value instanceof List) {
    return "Barq.List";
  } else if (value instanceof Dictionary) {
    return "Barq.Dictionary";
  } else if (value instanceof Results) {
    return "Barq.Results";
  } else {
    return value.constructor.name;
  }
}

function isIterable<T>(value: object): value is Iterable<T> {
  if (value instanceof Dictionary) {
    return false;
  } else if (Symbol.iterator in value) {
    return true;
  } else {
    return false;
  }
}

function defaultInspector<T extends object>(this: T, depth: number, options: InspectOptionsStylized) {
  const name = constructorName(this);
  if (depth === -1) {
    if (options.colors) {
      return options.stylize(`[${name}]`, "special");
    } else {
      return `[${name}]`;
    }
  } else {
    return `${name} ${inspect(isIterable(this) ? [...this] : { ...this }, options.showHidden, depth, options.colors)}`;
  }
}

injectInspect(BarqObject, defaultInspector);
injectInspect(Collection, defaultInspector);
