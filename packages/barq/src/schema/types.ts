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

import type { ObjectId, UUID } from "../types";
import type { Barq } from "../Barq";
import type { BarqObject } from "../Object";

export type DefaultObject = Record<string, unknown>;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Using `any` instead of `unknown` here to make it easier to pass */
export type Constructor<T = unknown> = { new (...args: any): T };
export type BarqObjectConstructor<T extends BarqObject = BarqObject> = {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Using `any` instead of `unknown` here to make it easier to pass */
  new (...args: any): T;
  // We need to declare schema as optional to support the babel plugin.
  // Otherwise it will produce a type error.
  schema?: ObjectSchema;
};

/**
 * The names of the supported Barq property types.
 */
export type PropertyTypeName = PrimitivePropertyTypeName | CollectionPropertyTypeName | RelationshipPropertyTypeName;

/**
 * Valid types for an object primary key.
 */
export type PrimaryKey = null | number | string | ObjectId | UUID;

/**
 * The names of the supported Barq primitive property types.
 */
export type PrimitivePropertyTypeName =
  | "bool"
  | "int"
  | "float"
  | "double"
  | "decimal128"
  | "objectId"
  | "string"
  | "data"
  | "date"
  | "mixed"
  | "uuid";

/**
 * The names of the supported Barq primitive property types and their
 * presentation types used in {@link PropertySchemaShorthand}.
 */
export type ShorthandPrimitivePropertyTypeName = PrimitivePropertyTypeName | PresentationPropertyTypeName;

/**
 * The names of the supported Barq collection property types.
 */
export type CollectionPropertyTypeName = "list" | "dictionary" | "set";

/**
 * The names of the supported Barq relationship property types.
 */
export type RelationshipPropertyTypeName = "object" | "linkingObjects";

/**
 * The names of the supported Barq presentation property types.
 *
 * Some types can be presented as a type different from the database type.
 * For instance, an integer that should behave like a logical counter is
 * presented as a `"counter"` type.
 */
export type PresentationPropertyTypeName = "counter";

/**
 * The name of a user-defined Barq object type. It must contain at least 1 character
 * and cannot be a {@link PropertyTypeName}. (Unicode is supported.)
 */
export type UserTypeName = string;

/**
 * @deprecated Will be removed in v13.0.0. Please use {@link CanonicalPropertySchema}.
 */
export type CanonicalObjectSchemaProperty = CanonicalPropertySchema;

/**
 * The type of index on a property:
 * - `true` enables a regular index
 * - `"full-text"` enables a full-text search index and can only be applied to string properties.
 */
export type IndexedType = boolean | "full-text";

/**
 * The distance metric used by a vector (knn) index.
 * - `"cosine"` (default) — cosine similarity; the usual choice for text/image embeddings.
 * - `"l2"` — squared euclidean distance.
 * - `"inner-product"` — dot product; expects vectors normalized upstream.
 */
export type VectorMetricName = "inner-product" | "l2" | "cosine";

/**
 * How a vector index stores its copy of the vectors.
 * - `"float32"` (default) — full precision, 4 bytes per dimension.
 * - `"sq8"` — scalar-quantized to 1 byte per dimension (~4x smaller), with exact
 *   re-rank on read so recall stays close to full precision.
 */
export type VectorEncodingName = "float32" | "sq8";

/**
 * Options for a vector (knn) index on a list-of-float property. Declaring this
 * builds a persisted HNSW index so the property can be searched with
 * {@link Results.knn}. The index is local — it is never written to sync changesets.
 */
export type VectorIndexOptions = {
  /** The fixed length of every stored vector. Required and enforced. */
  dimensions: number;
  /** Distance metric. Default: `"cosine"`. */
  metric?: VectorMetricName;
  /** Vector storage encoding. Default: `"float32"`. */
  encoding?: VectorEncodingName;
  /** HNSW graph out-degree. Default: `16`. */
  m?: number;
  /** Build-time beam width. Default: `200`. */
  efConstruction?: number;
  /** Default query beam width, or `0` for the engine default. */
  efSearch?: number;
  /** Full build/rebuild workers, or `0` for one per available core. */
  buildThreads?: number;
};

/** The normalized form of {@link VectorIndexOptions} with all defaults resolved. */
export type CanonicalVectorIndex = {
  dimensions: number;
  metric: VectorMetricName;
  encoding: VectorEncodingName;
  m: number;
  efConstruction: number;
  efSearch: number;
  buildThreads: number;
};

/**
 * Options for a k-nearest-neighbour (knn) search — see `Results.knn`.
 * A search is either approximate (the default, optionally tuned with `ef`) or
 * `exact`; `ef` is ignored when `exact` is `true`.
 */
export type KnnOptions = {
  /** How many nearest neighbours to return. */
  k: number;
  /**
   * Approximate-search beam width. Higher trades speed for recall. Omit (or use
   * `0`) to let the index pick a width that scales with how many vectors it holds.
   */
  ef?: number;
  /**
   * Run an exact brute-force search for the true neighbours (no recall loss, but
   * slower). Overrides `ef`.
   */
  exact?: boolean;
};

/**
 * The canonical representation of the schema of a specific property.
 */
export type CanonicalPropertySchema = {
  name: string;
  type: PropertyTypeName;
  objectType?: string;
  presentation?: PresentationPropertyTypeName;
  optional: boolean;
  indexed: IndexedType;
  /** A vector (knn) index on this property, if declared. */
  vector?: CanonicalVectorIndex;
  mapTo: string; // TODO: Make this optional and leave it out when it equals the name
  property?: string;
  default?: unknown;
};

/**
 * The schema for specifying the type of Barq object.
 */
export type BaseObjectSchema = {
  /**
   * The name of the Barq object type. The name must be unique across all objects
   * within the same Barq.
   */
  name: string;
  /**
   * The name of the property in `properties` that is used as the primary key. The
   * value of that property must be unique across all objects of this type within
   * the same Barq.
   */
  primaryKey?: string;
  /**
   * Whether the object is embedded. An embedded object always belongs to exactly
   * one parent object and is deleted if its parent is deleted.
   *
   * Default value: `false`.
   */
  embedded?: boolean;
  /**
   * Whether the object is used in asymmetric sync. An object that is asymmetrically
   * synced is not stored locally and cannot be accessed locally. Querying such
   * objects will throw an error. This is useful for write-heavy applications that
   * only need to get data from devices to the cloud fast.
   *
   * Default value: `false`.
   */
  asymmetric?: boolean;
  /**
   * The properties and their types belonging to this object.
   */
  properties: unknown;
};

/**
 * The schema of a specific type of object.
 */
export type ObjectSchema = BaseObjectSchema & {
  properties: PropertiesTypes;
};

/**
 * The canonical representation of the schema of a specific type of object.
 */
export type CanonicalObjectSchema<T = DefaultObject> = BaseObjectSchema & {
  properties: CanonicalPropertiesTypes<keyof T>;
  ctor?: BarqObjectConstructor;
};

/**
 * The properties of a Barq object defined in {@link ObjectSchema.properties} where
 * each key is the name of a property and the value is its type in the form of a
 * {@link PropertySchemaShorthand} or {@link PropertySchema}.
 */
export type PropertiesTypes = {
  [key: string]: PropertySchema | PropertySchemaShorthand;
};

export type CanonicalPropertiesTypes<K extends symbol | number | string = string> = Record<K, CanonicalPropertySchema>;

/**
 * The shorthand string representation of a schema for specifying the type of a
 * Barq object property.
 *
 * Required string structure:
 * - ({@link ShorthandPrimitivePropertyTypeName} | {@link UserTypeName})(`"?"` | `""`)(`"[]"` | `"{}"` | `"<>"` | `""`)
 *   - `"?"`
 *     - The marker to declare an optional type or an optional element in a collection
 *       if the type itself is a collection. Can only be used when declaring property
 *       types using this shorthand string notation.
 *   - `"[]"` (list)
 *   - `"{}"` (dictionary)
 *   - `"<>"` (set)
 *     - The markers to declare a collection type. Can only be used when declaring
 *       property types using this shorthand string notation.
 * @example
 * "int"
 * "int?"
 * "int[]"
 * "int?[]"
 * @see {@link PropertySchema} for using the object representation of a property schema.
 */
export type PropertySchemaShorthand = string;

/**
 * @deprecated Will be removed in v13.0.0. Please use {@link PropertySchema}.
 */
export type ObjectSchemaProperty = PropertySchema;

/**
 * The schema for specifying the type of a specific Barq object property.
 *
 * Requirements:
 * - `"mixed"` types are always optional because `null` is a valid value within `"mixed"`
 *   itself. Therefore, they cannot be made non-optional.
 * - User-defined object types are always optional except in lists and sets due to the
 *   object being deleted whenever it is removed from lists and sets and are therefore
 *   never set to `null` or `undefined`. Whereas in in dictionaries, deleted values are
 *   set to `null` and cannot be made non-optional.
 * - Properties declared as the primary key in {@link ObjectSchema.primaryKey} are always
 *   indexed. In such cases, they cannot be made non-indexed.
 * @see {@link PropertySchemaShorthand} for a shorthand representation of a property
 * schema.
 * @see {@link PropertySchemaStrict} for a precise type definition of the requirements
 * with the allowed combinations. {@link PropertySchema} is less strict in order to provide
 * a more user-friendly option due to misleading TypeScript error messages when working with
 * the strict type. This type is currently recommended for that reason, but the strict
 * type is provided as guidance. (Exact errors will always be shown when creating a
 * {@link Barq} instance if the schema is invalid.)
 */
export type PropertySchema = {
  /**
   * The type of the property.
   */
  type: PropertyTypeName;
  /**
   * The type of the elements in the collection if `type` is a {@link CollectionPropertyTypeName},
   * or the specific Barq object type if `type` is a {@link RelationshipPropertyTypeName}.
   */
  objectType?: PrimitivePropertyTypeName | UserTypeName;
  /**
   * The presentation type of the property.
   *
   * Some types can be presented as a type different from the database type.
   * For instance, an integer that should behave like a logical counter is
   * presented as a `"counter"` type.
   * @example
   * // A counter
   * {
   *    type: "int",
   *    presentation: "counter",
   * }
   */
  presentation?: PresentationPropertyTypeName;
  /**
   * The name of the property of the object specified in `objectType` that creates this
   * link. (Can only be set for linking objects.)
   */
  property?: string;
  /**
   * Whether to allow `null` or `undefined` to be assigned to the property; or in the
   * case of a collection, to be assigned to its elements. (Barq object types in lists
   * and sets cannot be optional.)
   *
   * Default value: `false` except in cases listed in the documentation for this type.
   */
  optional?: boolean;
  /**
   * The type of index applied to the property.
   *
   * Default value: `false` if the property is not a primary key, otherwise `true`.
   */
  indexed?: IndexedType;
  /**
   * Options for a vector (knn) index on this list-of-float property. When set, a
   * persisted HNSW index is built so the property can be searched with
   * {@link Results.knn}. The property must be a list of floats.
   * @example
   * { type: "list", objectType: "float", vector: { dimensions: 96, metric: "l2" } }
   */
  vector?: VectorIndexOptions;
  /**
   * The name to be persisted in the Barq file if it differs from the already-defined
   * JavaScript/TypeScript (JS/TS) property name. This is useful for allowing different
   * naming conventions than what is persisted in the Barq file. Reading and writing
   * properties must be done using the JS/TS name, but queries can use either the JS/TS
   * name or the persisted name.
   */
  mapTo?: string;
  /**
   * The default value that the property will be set to when created.
   */
  default?: unknown;
};

/**
 * Keys used in the property schema that are common among all variations of {@link PropertySchemaStrict}.
 */
export type PropertySchemaCommon = {
  presentation: never;
  indexed?: IndexedType;
  vector?: VectorIndexOptions;
  mapTo?: string;
  default?: unknown;
};

/**
 * The strict schema for specifying the type of a specific Barq object property.
 *
 * Unlike the less strict {@link PropertySchema}, the strict type precisely defines the type
 * requirements and their allowed combinations; however, TypeScript error messages tend
 * to be more misleading. {@link PropertySchema} is recommended for that reason, but the
 * strict type is provided as guidance.
 * @see {@link PropertySchema} for a textual explanation of the requirements defined here,
 *   as well as documentation for each property.
 */
export type PropertySchemaStrict = PropertySchemaCommon &
  (
    | {
        type: Exclude<PrimitivePropertyTypeName, "mixed" | "int">;
        optional?: boolean;
      }
    | {
        type: "int";
        optional?: boolean;
        presentation?: "counter";
      }
    | {
        type: "mixed";
        optional?: true;
      }
    | {
        type: CollectionPropertyTypeName;
        objectType: Exclude<PrimitivePropertyTypeName, "mixed">;
        optional?: boolean;
      }
    | {
        type: CollectionPropertyTypeName;
        objectType: "mixed";
        optional?: true;
      }
    | {
        type: "list" | "set";
        objectType: UserTypeName;
        optional?: false;
      }
    | {
        type: "dictionary";
        objectType: UserTypeName;
        optional?: true;
      }
    | {
        type: "object";
        objectType: UserTypeName;
        optional?: true;
      }
    | {
        type: "linkingObjects";
        objectType: UserTypeName;
        property: string;
        optional?: false;
      }
  );

export type ObjectType = string | BarqObjectConstructor;
