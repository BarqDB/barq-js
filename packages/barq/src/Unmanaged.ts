////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
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

import type { AnyBarqObject } from "./Object";
import type { AnyCollection, Collection } from "./Collection";
import type { Counter } from "./Counter";
import type { AnyDictionary, Dictionary } from "./Dictionary";
import type { AnyList, List } from "./List";
import type { Barq } from "./Barq";
import type { AnySet, BarqSet } from "./Set";

type ExtractPropertyNamesOfType<T, PropType> = {
  [K in keyof T]: T[K] extends PropType ? K : never;
}[keyof T];

type ExtractPropertyNamesOfTypeExcludingNullability<T, PropType> = {
  [K in keyof T]: Exclude<T[K], null | undefined> extends PropType ? K : never;
}[keyof T];

/**
 * Exchanges properties defined as {@link List} with an optional {@link Array}.
 */
type BarqListRemappedModelPart<T> = {
  [K in ExtractPropertyNamesOfType<T, AnyList>]?: T[K] extends List<infer GT> ? Array<GT | Unmanaged<GT>> : never;
};

/**
 * Exchanges properties defined as {@link Dictionary} with an optional key to mixed value object.
 */
type BarqDictionaryRemappedModelPart<T> = {
  [K in ExtractPropertyNamesOfType<T, AnyDictionary>]?: T[K] extends Dictionary<infer ValueType>
    ? { [key: string]: ValueType }
    : never;
};

/**
 * Exchanges properties defined as {@link BarqSet} with an optional {@link Array}.
 */
type BarqSetRemappedModelPart<T> = {
  [K in ExtractPropertyNamesOfType<T, AnySet>]?: T[K] extends BarqSet<infer GT> ? Array<GT | Unmanaged<GT>> : never;
};

/**
 * Exchanges properties defined as a {@link Counter} with a `number`.
 */
type BarqCounterRemappedModelPart<T> = {
  [K in ExtractPropertyNamesOfTypeExcludingNullability<T, Counter>]?: Counter | number | Exclude<T[K], Counter>;
};

/** Omits all properties of a model which are not defined by the schema */
export type OmittedBarqTypes<T> = Omit<
  T,
  | keyof AnyBarqObject
  /* eslint-disable-next-line @typescript-eslint/ban-types */
  | ExtractPropertyNamesOfType<T, Function> // TODO: Figure out the use-case for this
  | ExtractPropertyNamesOfType<T, AnyCollection>
  | ExtractPropertyNamesOfType<T, AnyDictionary>
  | ExtractPropertyNamesOfTypeExcludingNullability<T, Counter>
>;

/** Make all fields optional except those specified in K */
type OptionalExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Omits all properties of a model which are not defined by the schema,
 * making all properties optional except those specified in RequiredProperties.
 */
type OmittedBarqTypesWithRequired<T, RequiredProperties extends keyof OmittedBarqTypes<T>> = OptionalExcept<
  OmittedBarqTypes<T>,
  RequiredProperties
>;

/** Remaps barq types to "simpler" types (arrays and objects) */
type RemappedBarqTypes<T> = BarqListRemappedModelPart<T> &
  BarqDictionaryRemappedModelPart<T> &
  BarqSetRemappedModelPart<T> &
  BarqCounterRemappedModelPart<T>;

/**
 * Joins `T` stripped of all keys which value extends {@link Collection} and all inherited from {@link Barq.Object},
 * with only the keys which value extends {@link List}, remapped as {@link Array}. All properties are optional
 * except those specified in `RequiredProperties`.
 */
export type Unmanaged<T, RequiredProperties extends keyof OmittedBarqTypes<T> = never> = OmittedBarqTypesWithRequired<
  T,
  RequiredProperties
> &
  RemappedBarqTypes<T>;
