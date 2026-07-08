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
import { createListAccessor } from "../collection-accessors/List";
import { createResultsAccessor } from "../collection-accessors/Results";
import { TypeAssertionError } from "../errors";
import { List } from "../List";
import { Results } from "../Results";
import { getTypeHelpers, toItemType } from "../TypeHelpers";
import type { PropertyAccessor, PropertyOptions } from "./types";

/** @internal */
export function createArrayPropertyAccessor({
  barq,
  type,
  name,
  columnKey,
  objectType,
  embedded,
  linkOriginPropertyName,
  getClassHelpers,
  optional,
}: PropertyOptions): PropertyAccessor {
  const barqInternal = barq.internal;
  const itemType = toItemType(type);
  const itemHelpers = getTypeHelpers(itemType, {
    barq,
    name: `element of ${name}`,
    optional,
    getClassHelpers,
    objectType,
    objectSchemaName: undefined,
  });

  if (itemType === binding.PropertyType.LinkingObjects) {
    // Locate the table of the targeted object
    assert.string(objectType, "object type");
    assert(objectType !== "", "Expected a non-empty string");
    const targetClassHelpers = getClassHelpers(objectType);
    const {
      objectSchema: { tableKey, persistedProperties },
    } = targetClassHelpers;
    // TODO: Check if we want to match with the `p.name` or `p.publicName` here
    const targetProperty = persistedProperties.find((p) => p.name === linkOriginPropertyName);
    assert(targetProperty, `Expected a '${linkOriginPropertyName}' property on ${objectType}`);
    const tableRef = binding.Helpers.getTable(barqInternal, tableKey);
    const resultsAccessor = createResultsAccessor({ barq, typeHelpers: itemHelpers, itemType });

    return {
      get(obj: binding.Obj) {
        const tableView = obj.getBacklinkView(tableRef, targetProperty.columnKey);
        const results = binding.Results.fromTableView(barqInternal, tableView);
        return new Results(barq, results, resultsAccessor, itemHelpers);
      },
      set() {
        throw new Error("Not supported");
      },
    };
  } else {
    const listAccessor = createListAccessor({ barq, typeHelpers: itemHelpers, itemType, isEmbedded: embedded });

    return {
      listAccessor,
      get(obj: binding.Obj) {
        const internal = binding.List.make(barq.internal, obj, columnKey);
        assert.instanceOf(internal, binding.List);
        return new List(barq, internal, listAccessor, itemHelpers);
      },
      set(obj, values) {
        assert.inTransaction(barq);
        assert.iterable(values);

        // Taking a snapshot in case we're iterating the list we're mutating
        const valuesSnapshot = values instanceof List ? values.snapshot() : values;
        const internal = binding.List.make(barq.internal, obj, columnKey);
        internal.removeAll();
        let index = 0;
        try {
          for (const value of valuesSnapshot) {
            listAccessor.insert(internal, index++, value);
          }
        } catch (err) {
          if (err instanceof TypeAssertionError) {
            err.rename(`${name}[${index - 1}]`);
          }
          throw err;
        }
      },
    };
  }
}
