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
import { indirect } from "../indirect";
import { createDictionaryAccessor } from "./Dictionary";
import { createListAccessor } from "./List";
import { createDefaultGetter } from "./OrderedCollection";
import type { TypeHelpers } from "../TypeHelpers";

/** @internal */
export type ResultsAccessor<T = unknown> = {
  get: (results: binding.Results, index: number) => T;
};

type ResultsAccessorFactoryOptions<T> = {
  barq: Barq;
  typeHelpers: TypeHelpers<T>;
  itemType: binding.PropertyType;
};

/** @internal */
export function createResultsAccessor<T>(options: ResultsAccessorFactoryOptions<T>): ResultsAccessor<T> {
  return options.itemType === binding.PropertyType.Mixed
    ? createResultsAccessorForMixed(options)
    : createResultsAccessorForKnownType(options);
}

function createResultsAccessorForMixed<T>({
  barq,
  typeHelpers,
}: Omit<ResultsAccessorFactoryOptions<T>, "itemType">): ResultsAccessor<T> {
  return {
    get(results, index) {
      const value = results.getAny(index);
      switch (value) {
        case binding.ListSentinel: {
          const accessor = createListAccessor<T>({ barq, typeHelpers, itemType: binding.PropertyType.Mixed });
          return new indirect.List<T>(barq, results.getList(index), accessor, typeHelpers) as T;
        }
        case binding.DictionarySentinel: {
          const accessor = createDictionaryAccessor<T>({ barq, typeHelpers, itemType: binding.PropertyType.Mixed });
          return new indirect.Dictionary<T>(barq, results.getDictionary(index), accessor, typeHelpers) as T;
        }
        default:
          return typeHelpers.fromBinding(value);
      }
    },
  };
}

function createResultsAccessorForKnownType<T>({
  typeHelpers,
  itemType,
}: Omit<ResultsAccessorFactoryOptions<T>, "barq">): ResultsAccessor<T> {
  return {
    get: createDefaultGetter({ fromBinding: typeHelpers.fromBinding, itemType }),
  };
}
