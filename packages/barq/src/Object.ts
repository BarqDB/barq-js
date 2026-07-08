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

import { binding } from "./binding";
import { assert } from "./assert";
import { AssertionError, TypeAssertionError } from "./errors";
import { indirect, injectIndirect } from "./indirect";
import { ObjectId, Decimal128, UUID } from "./types";
import {
  type CanonicalObjectSchema,
  type Constructor,
  type DefaultObject,
  type ObjectSchema,
  type BarqObjectConstructor,
  getTypeName,
} from "./schema";
import type { ClassHelpers } from "./ClassHelpers";
import type { Collection } from "./Collection";
import { JSONCacheMap } from "./JSONCacheMap";
import { type ObjectChangeCallback, ObjectListeners } from "./ObjectListeners";
import type { OmittedBarqTypes, Unmanaged } from "./Unmanaged";
import type { Barq } from "./Barq";
import type { Results } from "./Results";
import type { TypeHelpers } from "./TypeHelpers";
import { flags } from "./flags";
import { OBJECT_HELPERS, OBJECT_INTERNAL, OBJECT_BARQ } from "./symbols";
import { createResultsAccessor } from "./collection-accessors/Results";

/**
 * The update mode to use when creating an object that already exists,
 * which is determined by a matching primary key.
 */
export enum UpdateMode {
  /**
   * Objects are only created. If an existing object exists (determined by a
   * matching primary key), an exception is thrown.
   */
  Never = "never",
  /**
   * If an existing object exists (determined by a matching primary key), only
   * properties where the value has actually changed will be updated. This improves
   * notifications and server side performance but also have implications for how
   * changes across devices are merged. For most use cases, the behavior will match
   * the intuitive behavior of how changes should be merged, but if updating an
   * entire object is considered an atomic operation, this mode should not be used.
   */
  Modified = "modified",
  /**
   * If an existing object exists (determined by a matching primary key), all
   * properties provided will be updated, any other properties will remain unchanged.
   */
  All = "all",
}

/** @internal */
export type ObjCreator = () => [binding.Obj, boolean];

type CreationContext = {
  helpers: ClassHelpers;
  createObj?: ObjCreator;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBarqObject = BarqObject<any>;

export const KEY_ARRAY = Symbol("Object#keys");
export const KEY_SET = Symbol("Object#keySet");
const INTERNAL_LISTENERS = Symbol("Object#listeners");
const DEFAULT_PROPERTY_DESCRIPTOR: PropertyDescriptor = { configurable: true, enumerable: true, writable: true };

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const PROXY_HANDLER: ProxyHandler<BarqObject<any>> = {
  ownKeys(target) {
    return Reflect.ownKeys(target).concat(target[KEY_ARRAY]);
  },
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === "string" && target[KEY_SET].has(prop)) {
      return DEFAULT_PROPERTY_DESCRIPTOR;
    }
    const result = Reflect.getOwnPropertyDescriptor(target, prop);
    if (result && typeof prop === "symbol") {
      if (prop === OBJECT_INTERNAL) {
        result.enumerable = false;
        result.writable = false;
      } else if (prop === INTERNAL_LISTENERS) {
        result.enumerable = false;
      }
    }
    return result;
  },
};

/**
 * Base class for a Barq Object.
 * @example
 * To define a class `Person` with required `name` and `age`
 * properties, define a `static schema`:
 * ```
 * class Person extends Barq.Object<Person> {
 *   _id!: Barq.Types.ObjectId;
 *   name!: string;
 *   age!: number;
 *   static schema: Barq.ObjectSchema = {
 *     name: "Person",
 *     primaryKey: "_id",
 *     properties: {
 *       _id: "objectId",
 *       name: "string",
 *       age: "int",
 *     },
 *   };
 * }
 * ```
 * @example
 * If using the [@barqdb/babel-plugin](https://www.npmjs.com/package/@barqdb/babel-plugin):
 * To define a class `Person` with required `name` and `age` properties, they would
 * need to be specified in the type argument when it is being constructed to allow
 * Typescript-only model definitions:
 * ```
 * class Person extends Barq.Object<Person, "name" | "age"> {
 *   _id = new Barq.Types.ObjectId();
 *   name: Barq.Types.String;
 *   age: Barq.Types.Int;
 *   static primaryKey = "_id";
 * }
 * ```
 * @see {@link ObjectSchema}
 * @typeParam `T` - The type of this class (e.g. if your class is `Person`,
 * `T` should also be `Person` - this duplication is required due to how
 * TypeScript works)
 * @typeParam `RequiredProperties` - The names of any properties of this
 * class which are required when an instance is constructed with `new`. Any
 * properties not specified will be optional, and will default to a sensible
 * null value if no default is specified elsewhere.
 */
export class BarqObject<T = DefaultObject, RequiredProperties extends keyof OmittedBarqTypes<T> = never> {
  /**
   * This property is stored on the per class prototype when transforming the schema.
   * @internal
   */
  public static [OBJECT_HELPERS]: ClassHelpers;

  public static allowValuesArrays = false;

  /**
   * Optionally specify the primary key of the schema when using [@barqdb/babel-plugin](https://www.npmjs.com/package/@barqdb/babel-plugin).
   */
  static primaryKey?: string;

  /**
   * Optionally specify that the schema is an embedded schema when using [@barqdb/babel-plugin](https://www.npmjs.com/package/@barqdb/babel-plugin).
   */
  static embedded?: boolean;

  /**
   * Optionally specify that the schema should sync unidirectionally if using flexible sync when using [@barqdb/babel-plugin](https://www.npmjs.com/package/@barqdb/babel-plugin).
   */
  static asymmetric?: boolean;

  /**
   * Create an object in the database and set values on it
   * @internal
   */
  public static create(
    barq: Barq,
    values: Record<string, unknown>,
    mode: UpdateMode,
    context: CreationContext,
  ): BarqObject {
    assert.inTransaction(barq);
    if (Array.isArray(values)) {
      if (flags.ALLOW_VALUES_ARRAYS) {
        const { persistedProperties } = context.helpers.objectSchema;
        return BarqObject.create(
          barq,
          Object.fromEntries(
            values.map((value, index) => {
              const property = persistedProperties[index];
              const propertyName = property.publicName || property.name;
              return [propertyName, value];
            }),
          ),
          mode,
          context,
        );
      } else {
        throw new Error("Array values on object creation is no longer supported");
      }
    }
    const {
      helpers: {
        properties,
        wrapObject,
        objectSchema: { persistedProperties },
      },
      createObj,
    } = context;

    // Create the underlying object
    const [obj, created] = createObj ? createObj() : this.createObj(barq, values, mode, context);
    const result = wrapObject(obj);
    assert(result);
    // Persist any values provided
    for (const property of persistedProperties) {
      const propertyName = property.publicName || property.name;
      const { default: defaultValue, get: getProperty, set: setProperty } = properties.get(propertyName);
      if (property.isPrimary) {
        continue; // Skip setting this, as we already provided it on object creation
      }
      const propertyValue = values[propertyName];
      if (typeof propertyValue !== "undefined") {
        if (mode !== UpdateMode.Modified || getProperty(obj) !== propertyValue) {
          // Calling `set`/`setProperty` (or `result[propertyName] = propertyValue`)
          // will call into the property setter in PropertyHelpers.ts.
          // (E.g. the setter for [binding.PropertyType.Array] in the case of lists.)
          setProperty(obj, propertyValue, created);
        }
      } else {
        // If the user has omitted a value for the `property`, and the underlying
        // object was just created, set the `property` to the default if provided.
        if (created) {
          if (typeof defaultValue !== "undefined") {
            const extractedValue = typeof defaultValue === "function" ? defaultValue() : defaultValue;
            setProperty(obj, extractedValue, created);
          } else if (
            !(property.type & binding.PropertyType.Collection) &&
            !(property.type & binding.PropertyType.Nullable)
          ) {
            throw new Error(`Missing value for property '${propertyName}'`);
          }
        }
      }
    }
    return result as BarqObject;
  }

  /**
   * Create an object in the database and populate its primary key value, if required
   * @internal
   */
  private static createObj(
    barq: Barq,
    values: DefaultObject,
    mode: UpdateMode,
    context: CreationContext,
  ): [binding.Obj, boolean] {
    const {
      helpers: {
        objectSchema: { name, tableKey, primaryKey },
        properties,
      },
    } = context;

    // Create the underlying object
    const table = binding.Helpers.getTable(barq.internal, tableKey);
    if (primaryKey) {
      const primaryKeyHelpers = properties.get(primaryKey);
      let primaryKeyValue = values[primaryKey];

      // If the value for the primary key was not set, use the default value
      if (primaryKeyValue === undefined) {
        const defaultValue = primaryKeyHelpers.default;
        primaryKeyValue = typeof defaultValue === "function" ? defaultValue() : defaultValue;
      }

      const pk = primaryKeyHelpers.toBinding(
        // Fallback to default value if the provided value is undefined or null
        typeof primaryKeyValue !== "undefined" && primaryKeyValue !== null
          ? primaryKeyValue
          : primaryKeyHelpers.default,
      );

      const result = binding.Helpers.getOrCreateObjectWithPrimaryKey(table, pk);
      const [, created] = result;
      if (mode === UpdateMode.Never && !created) {
        throw new Error(
          `Attempting to create an object of type '${name}' with an existing primary key value '${primaryKeyValue}'.`,
        );
      }
      return result;
    } else {
      return [table.createObject(), true];
    }
  }

  /**
   * Create a wrapper for accessing an object from the database
   * @internal
   */
  public static createWrapper<T = DefaultObject>(internal: binding.Obj, constructor: Constructor): BarqObject<T> & T {
    const result = Object.create(constructor.prototype);
    result[OBJECT_INTERNAL] = internal;
    // Initializing INTERNAL_LISTENERS here rather than letting it just be implicitly undefined since JS engines
    // prefer adding all fields to objects upfront. Adding optional fields later can sometimes trigger deoptimizations.
    result[INTERNAL_LISTENERS] = null;

    // Wrap in a proxy to trap keys, enabling the spread operator, and hiding our internal fields.
    return new Proxy(result, PROXY_HANDLER);
  }

  /**
   * Create a `BarqObject` wrapping an `Obj` from the binding.
   * @param barq - The Barq managing the object.
   * @param values - The values of the object's properties at creation.
   */
  public constructor(barq: Barq, values: Unmanaged<T, RequiredProperties>) {
    return barq.create(this.constructor as BarqObjectConstructor, values) as unknown as this;
  }

  /**
   * The Barq managing the object.
   * Note: this is on the injected prototype from ClassMap.defineProperties().
   * @internal
   */
  public declare readonly [OBJECT_BARQ]: Barq;

  /**
   * The object's representation in the binding.
   * @internal
   */
  public declare readonly [OBJECT_INTERNAL]: binding.Obj;

  /**
   * Lazily created wrapper for the object notifier.
   * @internal
   */
  private declare [INTERNAL_LISTENERS]: ObjectListeners<T> | null;

  /**
   * Note: this is on the injected prototype from ClassMap.defineProperties()
   * @internal
   */
  private declare readonly [KEY_ARRAY]: ReadonlyArray<string>;

  /**
   * Note: this is on the injected prototype from ClassMap.defineProperties()
   * @internal
   */
  private declare readonly [KEY_SET]: ReadonlySet<string>;

  /**
   * @returns An array of the names of the object's properties.
   * @deprecated Please use {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys | Object.keys()}
   */
  keys(): string[] {
    // copying to prevent caller from modifying the static array.
    return [...this[KEY_ARRAY]];
  }

  /**
   * @returns An array of key/value pairs of the object's properties.
   * @deprecated Please use {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries | Object.entries()}
   */
  entries(): [string, unknown][] {
    return Object.entries(this);
  }

  /**
   * The plain object representation for JSON serialization.
   * Use circular JSON serialization libraries such as [@ungap/structured-clone](https://www.npmjs.com/package/@ungap/structured-clone)
   * and [flatted](https://www.npmjs.com/package/flatted) to stringify Barq entities that have circular structures.
   * @returns A plain object.
   */
  toJSON(_?: string, cache?: unknown): DefaultObject;
  /** @internal */
  toJSON(_?: string, cache = new JSONCacheMap()): DefaultObject {
    // Construct a reference-id of table-name & primaryKey if it exists, or fall back to objectId.

    // Check if current objectId has already processed, to keep object references the same.
    const existing = cache.find(this);
    if (existing) {
      return existing;
    }
    const result: DefaultObject = {};
    cache.add(this, result);
    // Move all enumerable keys to result, triggering any specific toJSON implementation in the process.
    for (const key in this) {
      const value = this[key];
      if (typeof value == "function") {
        continue;
      }
      if (
        value instanceof indirect.Object ||
        value instanceof indirect.OrderedCollection ||
        value instanceof indirect.Dictionary
      ) {
        // recursively trigger `toJSON` for Barq instances with the same cache.
        result[key] = value.toJSON(key, cache);
      } else {
        // Other cases, including null and undefined.
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Checks if this object has not been deleted and is part of a valid Barq.
   * @returns `true` if the object can be safely accessed, `false` if not.
   */
  isValid(): boolean {
    return this[OBJECT_INTERNAL] && this[OBJECT_INTERNAL].isValid;
  }

  /**
   * The schema for the type this object belongs to.
   * @returns The {@link CanonicalObjectSchema} that describes this object.
   */
  objectSchema(): CanonicalObjectSchema<T> {
    return this[OBJECT_BARQ].getClassHelpers(this).canonicalObjectSchema as CanonicalObjectSchema<T>;
  }

  /**
   * Returns all the objects that link to this object in the specified relationship.
   * @param objectType - The type of the objects that link to this object's type.
   * @param propertyName - The name of the property that references objects of this object's type.
   * @throws An {@link AssertionError} if the relationship is not valid.
   * @returns The {@link Results} that link to this object.
   */
  linkingObjects<T = DefaultObject>(objectType: string, propertyName: string): Results<BarqObject<T> & T>;
  linkingObjects<T extends AnyBarqObject>(objectType: Constructor<T>, propertyName: string): Results<T>;
  linkingObjects<T extends AnyBarqObject>(objectType: string | Constructor<T>, propertyName: string): Results<T> {
    const barq = this[OBJECT_BARQ];
    const targetClassHelpers = barq.getClassHelpers(objectType);
    const { objectSchema: targetObjectSchema, properties, wrapObject } = targetClassHelpers;
    const targetProperty = properties.get(propertyName);
    const originObjectSchema = this.objectSchema();

    assert(
      originObjectSchema.name === targetProperty.objectType,
      () => `'${targetObjectSchema.name}#${propertyName}' is not a relationship to '${originObjectSchema.name}'`,
    );

    const typeHelpers: TypeHelpers<T> = {
      // See `[binding.PropertyType.LinkingObjects]` in `TypeHelpers.ts`.
      toBinding(value: unknown) {
        return value as binding.MixedArg;
      },
      fromBinding(value: unknown) {
        assert.instanceOf(value, binding.Obj);
        return wrapObject(value) as T;
      },
    };
    const accessor = createResultsAccessor<T>({ barq, typeHelpers, itemType: binding.PropertyType.Object });

    // Create the Result for the backlink view.
    const tableRef = binding.Helpers.getTable(barq.internal, targetObjectSchema.tableKey);
    const tableView = this[OBJECT_INTERNAL].getBacklinkView(tableRef, targetProperty.columnKey);
    const results = binding.Results.fromTableView(barq.internal, tableView);

    return new indirect.Results<T>(barq, results, accessor, typeHelpers);
  }

  /**
   * Returns the total count of incoming links to this object
   * @returns The number of links to this object.
   */
  linkingObjectsCount(): number {
    return this[OBJECT_INTERNAL].getBacklinkCount();
  }

  /**
   * @deprecated
   * TODO: Remove completely once the type tests are abandoned.
   */
  _objectId(): string {
    throw new Error("This is now removed!");
  }

  /**
   * A string uniquely identifying the object across all objects of the same type.
   */
  _objectKey(): string {
    return this[OBJECT_INTERNAL].key.toString();
  }

  /**
   * Add a listener `callback` which will be called when a **live** object instance changes.
   * @param callback - A function to be called when changes occur.
   * @param keyPaths - Indicates a lower bound on the changes relevant for the listener. This is a lower bound, since if multiple listeners are added (each with their own `keyPaths`) the union of these key-paths will determine the changes that are considered relevant for all listeners registered on the object. In other words: A listener might fire more than the key-paths specify, if other listeners with different key-paths are present.
   * @throws A {@link TypeAssertionError} if `callback` is not a function.
   * @note
   * Adding the listener is an asynchronous operation, so the callback is invoked the first time to notify the caller when the listener has been added.
   * Thus, when the callback is invoked the first time it will contain an empty array for {@link Barq.ObjectChangeSet.changedProperties | changes.changedProperties}.
   *
   * Unlike {@link Collection.addListener}, changes on properties containing other objects (both standalone and embedded) will not trigger this listener.
   * @example
   * wine.addListener((obj, changes) => {
   *  // obj === wine
   *  console.log(`object is deleted: ${changes.deleted}`);
   *  console.log(`${changes.changedProperties.length} properties have been changed:`);
   *  changes.changedProperties.forEach(prop => {
   *      console.log(` ${prop}`);
   *   });
   * })
   * @example
   * wine.addListener((obj, changes) => {
   *  console.log("The wine got deleted or its brand might have changed");
   * }, ["brand"])
   */
  addListener(callback: ObjectChangeCallback<T>, keyPaths?: string | string[]): void {
    assert.function(callback);
    if (!this[INTERNAL_LISTENERS]) {
      this[INTERNAL_LISTENERS] = new ObjectListeners<T>(this[OBJECT_BARQ].internal, this);
    }
    this[INTERNAL_LISTENERS].addListener(callback, typeof keyPaths === "string" ? [keyPaths] : keyPaths);
  }

  /**
   * Remove the listener `callback` from this object.
   * @throws A {@link TypeAssertionError} if `callback` is not a function.
   * @param callback A function previously added as listener
   */
  removeListener(callback: ObjectChangeCallback<T>): void {
    assert.function(callback);
    // Note: if the INTERNAL_LISTENERS field hasn't been initialized, then we have no listeners to remove.
    this[INTERNAL_LISTENERS]?.removeListener(callback);
  }

  /**
   * Remove all listeners from this object.
   */
  removeAllListeners(): void {
    // Note: if the INTERNAL_LISTENERS field hasn't been initialized, then we have no listeners to remove.
    this[INTERNAL_LISTENERS]?.removeAllListeners();
  }

  /**
   * Get underlying type of a property value.
   * @param propertyName - The name of the property to retrieve the type of.
   * @throws An {@link Error} if property does not exist.
   * @returns Underlying type of the property value.
   */
  getPropertyType(propertyName: string): string {
    const { properties } = this[OBJECT_BARQ].getClassHelpers(this);
    const { type, objectType, columnKey } = properties.get(propertyName);
    const typeName = getTypeName(type, objectType);
    if (typeName === "mixed") {
      // This requires actually getting the object and inferring its type
      const value = this[OBJECT_INTERNAL].getAny(columnKey);
      if (value === null) {
        return "null";
      } else if (binding.Int64.isInt(value)) {
        return "int";
      } else if (value instanceof binding.Float) {
        return "float";
      } else if (value instanceof binding.Timestamp) {
        return "date";
      } else if (value instanceof binding.Obj) {
        const { objectSchema } = this[OBJECT_BARQ].getClassHelpers(value.table.key);
        return `<${objectSchema.name}>`;
      } else if (value instanceof binding.ObjLink) {
        const { objectSchema } = this[OBJECT_BARQ].getClassHelpers(value.tableKey);
        return `<${objectSchema.name}>`;
      } else if (value instanceof ArrayBuffer) {
        return "data";
      } else if (typeof value === "number") {
        return "double";
      } else if (typeof value === "string") {
        return "string";
      } else if (typeof value === "boolean") {
        return "bool";
      } else if (value instanceof ObjectId) {
        return "objectId";
      } else if (value instanceof Decimal128) {
        return "decimal128";
      } else if (value instanceof UUID) {
        return "uuid";
      } else if (value === binding.ListSentinel) {
        return "list";
      } else if (value === binding.DictionarySentinel) {
        return "dictionary";
      } else if (typeof value === "symbol") {
        throw new Error(`Unexpected Symbol: ${value.toString()}`);
      } else {
        assert.never(value, "value");
      }
    } else {
      return typeName;
    }
  }
}

// We like to refer to this as "Barq.Object"
// TODO: Determine if we want to revisit this if we're going away from a namespaced API
Object.defineProperty(BarqObject, "name", { value: "Barq.Object" });

injectIndirect("Object", BarqObject);
