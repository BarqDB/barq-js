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
import { Dictionary } from "../Dictionary";
import {
  createDictionaryAccessor,
  insertIntoDictionaryOfMixed,
  isJsOrBarqDictionary,
} from "../collection-accessors/Dictionary";
import { List } from "../List";
import { createListAccessor, insertIntoListOfMixed, isJsOrBarqList } from "../collection-accessors/List";
import { createDefaultPropertyAccessor } from "./default";
import type { PropertyAccessor, PropertyOptions } from "./types";

/** @internal */
export function createMixedPropertyAccessor(options: PropertyOptions): PropertyAccessor {
  const { barq, columnKey, typeHelpers } = options;
  const { fromBinding, toBinding } = typeHelpers;
  const listAccessor = createListAccessor({ barq, typeHelpers, itemType: binding.PropertyType.Mixed });
  const dictionaryAccessor = createDictionaryAccessor({ barq, typeHelpers, itemType: binding.PropertyType.Mixed });
  const { set: defaultSet } = createDefaultPropertyAccessor(options);

  return {
    get(obj) {
      try {
        const value = obj.getAny(columnKey);
        switch (value) {
          case binding.ListSentinel: {
            const internal = binding.List.make(barq.internal, obj, columnKey);
            return new List(barq, internal, listAccessor, typeHelpers);
          }
          case binding.DictionarySentinel: {
            const internal = binding.Dictionary.make(barq.internal, obj, columnKey);
            return new Dictionary(barq, internal, dictionaryAccessor, typeHelpers);
          }
          default:
            return fromBinding(value);
        }
      } catch (err) {
        assert.isValid(obj);
        throw err;
      }
    },
    set(obj: binding.Obj, value: unknown) {
      assert.inTransaction(barq);

      if (isJsOrBarqList(value)) {
        obj.setCollection(columnKey, binding.CollectionType.List);
        const internal = binding.List.make(barq.internal, obj, columnKey);
        insertIntoListOfMixed(value, internal, toBinding);
      } else if (isJsOrBarqDictionary(value)) {
        obj.setCollection(columnKey, binding.CollectionType.Dictionary);
        const internal = binding.Dictionary.make(barq.internal, obj, columnKey);
        insertIntoDictionaryOfMixed(value, internal, toBinding);
      } else {
        defaultSet(obj, value);
      }
    },
  };
}
