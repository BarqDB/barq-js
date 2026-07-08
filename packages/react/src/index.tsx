////////////////////////////////////////////////////////////////////////////
//
// Copyright 2021 Realm Inc.
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

import Barq from "@barqdb/barq";
import React from "react";
import { createBarqContext } from "./BarqContext";

export type { UseObjectHook } from "./useObject";
export type { UseQueryHook, QueryHookOptions } from "./useQuery";

const defaultContext = createBarqContext();

/**
 * The Provider component that is required to wrap any component using
 * the Barq hooks.
 * @example
 * ```
 * const AppRoot = () => {
 *   const syncConfig = {
 *     flexible: true,
 *     user: currentUser
 *   };
 *
 *   return (
 *     <BarqProvider schema={[Task, User]} path={"data.barq"} sync={syncConfig}>
 *       <App/>
 *     </BarqProvider>
 *   )
 * }
 * ```
 * @example
 *  const syncConfig = {
 *     flexible: true,
 *     user: currentUser
 *   };
 *  const barq = new Barq(schema:[Task, User], path:"data.barq", sync: syncConfig);
 *  ...
 *  const AppRoot = () => {
 *   return (
 *     <BarqProvider>
 *       <App/>
 *     </BarqProvider>
 *   )
 * }
 * @param props - The {@link Barq.Configuration} or {@link Barq} for this Provider, passed as props.
 */
export const BarqProvider = defaultContext.BarqProvider;

/**
 * Returns the instance of the {@link Barq} opened by the `BarqProvider`.
 * @example
 * ```
 * const barq = useBarq();
 * ```
 * @returns a barq instance
 */
export const useBarq = defaultContext.useBarq;

/**
 * Returns a {@link Barq.Collection} of {@link Barq.Object}s from a given type.
 * The hook will update on any changes to any object in the collection.
 *
 * The result of this can be consumed directly by the `data` argument of any React Native
 * VirtualizedList or FlatList.  If the component used for the list's `renderItem` prop is {@link React.Memo}ized,
 * then only the modified object will re-render.
 * @example
 * ```tsx
 * // Return all collection items
 * const collection = useQuery({ type: Object });
 *
 * // Return all collection items sorted by name and filtered by category
 * const filteredAndSorted = useQuery({
 *   type: Object,
 *   query: (collection) => collection.filtered('category == $0',category).sorted('name'),
 * }, [category]);
 *
 * // Return all collection items sorted by name and filtered by category, triggering re-renders only if "name" changes
 * const filteredAndSorted = useQuery({
 *   type: Object,
 *   query: (collection) => collection.filtered('category == $0',category).sorted('name'),
 *   keyPaths: ["name"]
 * }, [category]);
 * ```
 * @param options
 * @param options.type - The object type, depicted by a string or a class extending Barq.Object
 * @param options.query - A function that takes a {@link Barq.Collection} and returns a {@link Barq.Collection} of the same type. This allows for filtering and sorting of the collection, before it is returned.
 * @param options.keyPaths - Indicates a lower bound on the changes relevant for the hook. This is a lower bound, since if multiple hooks add listeners (each with their own `keyPaths`) the union of these key-paths will determine the changes that are considered relevant for all listeners registered on the collection. In other words: A listener might fire and cause a re-render more than the key-paths specify, if other listeners with different key-paths are present.
 * @param deps - An array of dependencies that will be passed to {@link React.useMemo}
 * @returns a collection of barq objects or an empty array
 */
export const useQuery = defaultContext.useQuery;

/**
 * Returns a {@link Barq.Object} from a given type and value of primary key.
 * The hook will update on any changes to the properties on the returned object
 * and return null if it either doesn't exists or has been deleted.
 * @example
 * ```
 * const object = useObject(ObjectClass, objectId);
 * ```
 * @param type - The object type, depicted by a string or a class extending {@link Barq.Object}
 * @param primaryKey - The primary key of the desired object which will be retrieved using {@link Barq.objectForPrimaryKey}
 * @param keyPaths - Indicates a lower bound on the changes relevant for the hook. This is a lower bound, since if multiple hooks add listeners (each with their own `keyPaths`) the union of these key-paths will determine the changes that are considered relevant for all listeners registered on the object. In other words: A listener might fire and cause a re-render more than the key-paths specify, if other listeners with different key-paths are present.
 * @returns either the desired {@link Barq.Object} or `null` in the case of it being deleted or not existing.
 */
export const useObject = defaultContext.useObject;
/**
 * Returns the value representing the progress for a given {@link Barq.ProgressDirection}
 * and {@link Barq.ProgressMode}. The hook will register a progress notifier and update from
 * any changes from it.
 * @example
 * ```
 * const progress = useProgress({ direction: ProgressDirection.Download, mode: ProgressMode.ReportIndefinitely });
 * return <Text>Loading: {(100 * progress).toFixed()}%</Text>;
 * ```
 * @param options
 * @param options.direction - The {@link Barq.ProgressDirection} for the progress notifier.
 * @param options.mode - The {@link Barq.ProgressMode} for the progress notifier.
 * @returns a number between 0 and 1 representing the progress
 */
export const useProgress = defaultContext.useProgress;

/*
 * @ignore This will end up documenting all of Barq, which is documented elsewhere
 */
export { Barq };
export { createBarqContext } from "./BarqContext";
export { useUser, UserProvider } from "./UserProvider";
export * from "./types";
export { createUseObject } from "./useObject";
export { createUseQuery } from "./useQuery";
