////////////////////////////////////////////////////////////////////////////
//
// Copyright 2021 Realm Inc.
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

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import Barq from "@barq/barq";

import { createCachedCollection } from "./cachedCollection";
import { AnyBarqObject, BarqClassType, getObjects, isClassModelConstructor } from "./helpers";

type QueryCallback<T> = (collection: Barq.Results<T>) => Barq.Results<T>;
type DependencyList = ReadonlyArray<unknown>;

export type QueryHookPartialOptions<T> = {
  type: string | BarqClassType<T>;
  keyPaths?: string | string[];
};

export type QueryHookOptions<T> = QueryHookPartialOptions<T> & {
  query?: QueryCallback<T>;
};

export type UseQueryHook = {
  <T>(options: QueryHookOptions<T>, deps?: DependencyList): Barq.Results<T & Barq.Object<T>>;
  <T extends AnyBarqObject>(options: QueryHookOptions<T>, deps?: DependencyList): Barq.Results<T>;
  <T>(type: string): Barq.Results<T & Barq.Object<T>>;
  <T extends AnyBarqObject>(type: BarqClassType<T>): Barq.Results<T>;
  <T extends AnyBarqObject>(
    query: QueryCallback<T>,
    deps: DependencyList,
    options: QueryHookPartialOptions<T>,
  ): Barq.Results<T>;
  <T>(query: QueryCallback<T>, deps: DependencyList, options: QueryHookPartialOptions<T>): Barq.Results<
    T & Barq.Object<T>
  >;

  /** @deprecated To help the `react-hooks/exhaustive-deps` eslint rule detect missing dependencies, we've suggest passing a option object as the first argument */
  <T>(type: string, query?: QueryCallback<T>, deps?: DependencyList): Barq.Results<T & Barq.Object<T>>;
  /** @deprecated To help the `react-hooks/exhaustive-deps` eslint rule detect missing dependencies, we've suggest passing a option object as the first argument */
  <T extends AnyBarqObject>(
    type: BarqClassType<T>,
    query?: QueryCallback<T>,
    deps?: DependencyList,
  ): Barq.Results<T>;
};

type PossibleQueryArgs<T> = {
  typeOrOptionsOrQuery: QueryHookOptions<T> | string | BarqClassType<T> | QueryCallback<T>;
  queryOrDeps?: DependencyList | QueryCallback<T>;
  depsOrPartialOptions?: DependencyList | QueryHookPartialOptions<T>;
};

/**
 * Maps a value to itself
 */
function identity<T>(value: T): T {
  return value;
}

/**
 * Generates the `useQuery` hook from a given `useBarq` hook.
 * @param useBarq - Hook that returns an open Barq instance
 * @returns useObject - Hook that is used to gain access to a {@link Barq.Collection}
 */
export function createUseQuery(useBarq: () => Barq): UseQueryHook {
  function useQuery<T extends AnyBarqObject>(
    { type, query = identity, keyPaths }: QueryHookOptions<T>,
    deps: DependencyList = [],
  ): Barq.Results<T> {
    const realm = useBarq();

    // We need to add the type to the deps, so that if the type changes, the query will be re-run.
    // This will be saved in an array which will be spread into the provided deps.
    const requiredDeps = [type];

    // Create a forceRerender function for the cachedCollection to use as its updateCallback, so that
    // the cachedCollection can force the component using this hook to re-render when a change occurs.
    const [, forceRerender] = useReducer((x) => x + 1, 0);
    const collectionRef = useRef<Barq.Results<T>>(null);
    const updatedRef = useRef(true);
    const queryCallbackRef = useRef<QueryCallback<T> | null>(null);

    /* eslint-disable-next-line react-hooks/exhaustive-deps -- We want the user of this hook to be able pass in the `query` function inline (without the need to `useCallback` on it)
    This means that the query function is unstable and will be a redefined on each render of the component where `useQuery` is used
    Therefore we use the `deps` array to memoize the query function internally, and only use the returned `queryCallback` */
    const queryCallback = useCallback(query, [...deps, ...requiredDeps]);

    // If the query function changes, we need to update the cachedCollection
    if (queryCallbackRef.current !== queryCallback) {
      queryCallbackRef.current = queryCallback;
      updatedRef.current = true;
    }

    const queryResult = useMemo(() => {
      return queryCallback(getObjects(realm, type));
    }, [type, realm, queryCallback]);

    const memoizedKeyPaths = useMemo(
      () => (typeof keyPaths === "string" ? [keyPaths] : keyPaths),
      /* eslint-disable-next-line react-hooks/exhaustive-deps -- Memoizing the keyPaths to avoid renders */
      [JSON.stringify(keyPaths)],
    );

    // Wrap the cachedObject in useMemo, so we only replace it with a new instance if `realm` or `queryResult` change
    const { collection, tearDown } = useMemo(() => {
      return createCachedCollection<T>({
        collection: queryResult,
        realm,
        updateCallback: forceRerender,
        updatedRef,
        keyPaths: memoizedKeyPaths,
      });
    }, [realm, queryResult, memoizedKeyPaths]);

    // Invoke the tearDown of the cachedCollection when useQuery is unmounted
    useEffect(() => {
      return tearDown;
    }, [tearDown]);

    // This makes sure the collection has a different reference on a rerender
    // Also we are ensuring the type returned is Barq.Results, as this is known in this context
    if (updatedRef.current) {
      updatedRef.current = false;
      collectionRef.current = new Proxy(collection as Barq.Results<T & Barq.Object>, {});
    }

    // This will never not be defined, but the type system doesn't know that
    return collectionRef.current as Barq.Results<T>;
  }

  return function useQueryOverload<T extends AnyBarqObject>(
    typeOrOptionsOrQuery: PossibleQueryArgs<T>["typeOrOptionsOrQuery"],
    queryOrDeps: PossibleQueryArgs<T>["queryOrDeps"] = identity,
    depsOrPartialOptions: PossibleQueryArgs<T>["depsOrPartialOptions"] = [],
  ): Barq.Results<T> {
    const args = { typeOrOptionsOrQuery, queryOrDeps, depsOrPartialOptions };
    /* eslint-disable react-hooks/rules-of-hooks -- We're calling `useQuery` once in any of the brances */
    if (isTypeFunctionDeps(args)) {
      return useQuery({ type: args.typeOrOptionsOrQuery, query: args.queryOrDeps }, args.depsOrPartialOptions);
    }
    if (isOptionsDepsNone(args)) {
      return useQuery(args.typeOrOptionsOrQuery, Array.isArray(args.queryOrDeps) ? args.queryOrDeps : []);
    }
    if (isFunctionDepsOptions(args)) {
      return useQuery({ ...args.depsOrPartialOptions, query: args.typeOrOptionsOrQuery }, args.queryOrDeps);
    }
    /* eslint-enable react-hooks/rules-of-hooks */

    throw new Error("Unexpected arguments passed to useQuery");
  };
}

function isTypeFunctionDeps<T>(args: PossibleQueryArgs<T>): args is {
  typeOrOptionsOrQuery: string | BarqClassType<T>;
  queryOrDeps: QueryCallback<T>;
  depsOrPartialOptions: DependencyList;
} {
  const { typeOrOptionsOrQuery, queryOrDeps, depsOrPartialOptions } = args;
  return (
    (typeof typeOrOptionsOrQuery === "string" || isClassModelConstructor(typeOrOptionsOrQuery)) &&
    typeof queryOrDeps === "function" &&
    Array.isArray(depsOrPartialOptions)
  );
}

function isOptionsDepsNone<T>(args: PossibleQueryArgs<T>): args is {
  typeOrOptionsOrQuery: QueryHookOptions<T>;
  queryOrDeps: DependencyList | typeof identity;
  depsOrPartialOptions: never;
} {
  const { typeOrOptionsOrQuery, queryOrDeps } = args;
  return (
    typeof typeOrOptionsOrQuery === "object" &&
    typeOrOptionsOrQuery !== null &&
    (Array.isArray(queryOrDeps) || queryOrDeps === identity)
  );
}

function isFunctionDepsOptions<T>(args: PossibleQueryArgs<T>): args is {
  typeOrOptionsOrQuery: QueryCallback<T>;
  queryOrDeps: DependencyList;
  depsOrPartialOptions: QueryHookPartialOptions<T>;
} {
  const { typeOrOptionsOrQuery, queryOrDeps, depsOrPartialOptions } = args;
  return (
    typeof typeOrOptionsOrQuery === "function" &&
    Array.isArray(queryOrDeps) &&
    typeof depsOrPartialOptions === "object" &&
    depsOrPartialOptions !== null
  );
}
