////////////////////////////////////////////////////////////////////////////
//
// Copyright 2024 Realm Inc.
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

import { binding } from "../binding";
import { assert } from "../assert";
import { TypeAssertionError } from "../errors";
import { Dictionary } from "../Dictionary";
import { getTypeHelpers, toItemType } from "../TypeHelpers";
import type { PropertyAccessor, PropertyOptions } from "./types";
import { createDictionaryAccessor } from "../collection-accessors/Dictionary";

/** @internal */
export function createDictionaryPropertyAccessor({
  columnKey,
  barq,
  name,
  type,
  optional,
  objectType,
  getClassHelpers,
  embedded,
}: PropertyOptions): PropertyAccessor {
  const itemType = toItemType(type);
  const itemHelpers = getTypeHelpers(itemType, {
    barq,
    name: `value in ${name}`,
    getClassHelpers,
    objectType,
    optional,
    objectSchemaName: undefined,
  });
  const dictionaryAccessor = createDictionaryAccessor({
    barq,
    typeHelpers: itemHelpers,
    itemType,
    isEmbedded: embedded,
  });

  return {
    get(obj) {
      const internal = binding.Dictionary.make(barq.internal, obj, columnKey);
      return new Dictionary(barq, internal, dictionaryAccessor, itemHelpers);
    },
    set(obj, value) {
      assert.inTransaction(barq);

      const internal = binding.Dictionary.make(barq.internal, obj, columnKey);
      // Clear the dictionary before adding new values
      internal.removeAll();
      assert.object(value, `values of ${name}`, { allowArrays: false });
      for (const [k, v] of Object.entries(value)) {
        try {
          dictionaryAccessor.set(internal, k, v);
        } catch (err) {
          if (err instanceof TypeAssertionError) {
            err.rename(`${name}["${k}"]`);
          }
          throw err;
        }
      }
    },
  };
}
