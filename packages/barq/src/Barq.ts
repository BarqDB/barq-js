////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
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
import { TypeAssertionError } from "./errors";
import { extendDebug } from "./debug";
import { flags } from "./flags";
import { injectIndirect } from "./indirect";
import { fs, garbageCollection } from "./platform";
import type { Unmanaged } from "./Unmanaged";
import { type AnyBarqObject, BarqObject } from "./Object";
import { type AnyResults, Results } from "./Results";
import {
  type CanonicalObjectSchema,
  type Constructor,
  type DefaultObject,
  type ObjectSchema,
  type PresentationPropertyTypeName,
  type BarqObjectConstructor,
  fromBindingBarqSchema,
  normalizeObjectSchema,
  normalizeBarqSchema,
  toBindingSchema,
  validateObjectSchema,
  validateBarqSchema,
} from "./schema";
import type { ClassHelpers } from "./ClassHelpers";
import { ClassMap } from "./ClassMap";
import { type Configuration, type MigrationCallback, validateConfiguration } from "./Configuration";
import { type InitialSubscriptions, toBindingSyncConfig } from "./sync/SyncConfiguration";
import {
  LOG_CATEGORIES,
  type LogCategory,
  type LogLevel,
  type LoggerCallback,
  type LoggerCallback1,
  type LoggerCallback2,
  defaultLogger,
  defaultLoggerLevel,
  toBindingLogger,
  toBindingLoggerLevel,
} from "./Logger";
import { type AnyList, List } from "./List";
import { ProgressBarqPromise } from "./ProgressBarqPromise";
import { UpdateMode } from "./Object";
import { BarqEvent, type BarqListenerCallback, BarqListeners } from "./BarqListeners";
import { SubscriptionSet } from "./sync/SubscriptionSet";
import { SyncSession } from "./sync/SyncSession";
import type { TypeHelpers } from "./TypeHelpers";
import { toArrayBuffer } from "./type-helpers/array-buffer";
import { OBJECT_INTERNAL, OBJECT_REALM } from "./symbols";
import { createResultsAccessor } from "./collection-accessors/Results";

const debug = extendDebug("Barq");

type BarqSchemaExtra = Record<string, ObjectSchemaExtra | undefined>;

type ObjectSchemaExtra = {
  constructor?: BarqObjectConstructor;
  defaults: Record<string, unknown>;
  presentations: Record<string, PresentationPropertyTypeName | undefined>;
  // objectTypes: Record<string, unknown>;
};

export type BarqEventName = "change" | "schema" | "beforenotify";

/**
 * Asserts the event passed as string is a valid BarqEvent value.
 * @throws A {@link TypeAssertionError} if an unexpected name is passed via {@link name}.
 * @param name - The name of the event.
 * @internal
 */
function assertBarqEvent(name: BarqEventName): asserts name is BarqEvent {
  const values = Object.values(BarqEvent);
  if (!values.includes(name as BarqEvent)) {
    throw new TypeAssertionError("One of " + values.join(", "), name);
  }
}

/** @internal */
type InternalConfig = {
  internal?: binding.Barq;
  schemaExtras?: BarqSchemaExtra;
  realmExists?: boolean;
};

/**
 * The Barq database.
 */
export class Barq {
  public static defaultPath = Barq.normalizePath("default.realm");

  private static internals = new Set<binding.WeakRef<binding.Barq>>();

  /**
   * Sets the log level.
   * @param level - The log level to be used by the logger. The default value is `info`.
   * @param category - The category to set the log level for. If omitted, the log level is set for all categories (`"Barq"`).
   * @note The log level can be changed during the lifetime of the application.
   * @since 12.0.0
   * @example
   * Barq.setLogLevel("all");
   */
  static setLogLevel(level: LogLevel, category: LogCategory = "Barq"): void {
    assert(LOG_CATEGORIES.includes(category as LogCategory), `Unexpected log category: '${category}'`);
    const categoryRef = binding.LogCategoryRef.getCategory(category);
    categoryRef.setDefaultLevelThreshold(toBindingLoggerLevel(level));
  }

  /**
   * Sets the logger callback.
   * @param loggerCallback - The callback invoked by the logger. The default callback uses `console.log`, `console.warn` and `console.error`, depending on the level of the message.
   * @note The logger callback needs to be set up before opening the first Barq.
   * @since 12.0.0
   * @example
   * Barq.setLogger(({ category, level, message }) => {
   *   console.log(`[${category} - ${level}] ${message}`);
   * });
   */
  static setLogger(loggerCallback: LoggerCallback2): void;

  /**
   * Sets the logger callback.
   * @param loggerCallback - The callback invoked by the logger. The default callback uses `console.log`, `console.warn` and `console.error`, depending on the level of the message.
   * @note The logger callback needs to be set up before opening the first Barq.
   * @since 12.0.0
   * @deprecated Pass a callback taking a single object argument instead.
   * @example
   * Barq.setLogger((level, message) => {
   *   console.log(`[${level}] ${message}`);
   * });
   */
  static setLogger(loggerCallback: LoggerCallback1): void;

  static setLogger(loggerCallback: LoggerCallback) {
    assert.function(loggerCallback);
    binding.Logger.setDefaultLogger(toBindingLogger(loggerCallback));
  }

  /**
   * Closes all Barqs, cancels all pending {@link Barq.open} calls, clears internal caches, resets the logger and collects garbage.
   * Call this method to free up the event loop and allow Node.js to perform a graceful exit.
   */
  public static shutdown() {
    // Close any realms not already closed
    for (const realmRef of Barq.internals) {
      const realm = realmRef.deref();
      if (realm && !realm.isClosed) {
        realm.close();
      }
    }
    Barq.internals.clear();
    binding.BarqCoordinator.clearAllCaches();
    binding.App.clearCachedApps();
    ProgressBarqPromise.cancelAll();

    binding.Logger.setDefaultLogger(null);
    garbageCollection.collect();
  }

  /**
   * Clears the state by closing and deleting any Barq in the default directory and logout all users.
   * NOTE: Not a part of the public API and it's primarily used from the library's tests.
   * @private
   */
  public static clearTestState(): void {
    assert(flags.ALLOW_CLEAR_TEST_STATE, "Set the flags.ALLOW_CLEAR_TEST_STATE = true before calling this.");
    Barq.shutdown();
    // Delete all Barq files in the default directory
    const defaultDirectoryPath = fs.getDefaultDirectoryPath();
    fs.removeBarqFilesFromDirectory(defaultDirectoryPath);
  }

  /**
   * Delete the Barq file for the given configuration.
   * @param config - The configuration for the Barq being deleted.
   * @throws An {@link Error} if anything in the provided {@link config} is invalid.
   */
  public static deleteFile(config: Configuration): void {
    validateConfiguration(config);
    const path = Barq.determinePath(config);
    fs.removeFile(path);
    fs.removeFile(path + ".lock");
    fs.removeFile(path + ".fresh.lock");
    fs.removeFile(path + ".note");
    fs.removeDirectory(path + ".management");
  }

  /**
   * Checks if the Barq already exists on disk.
   * @param path - The path for a Barq.
   * @throws An {@link Error} if anything in the provided {@link path} is invalid.
   * @returns `true` if the Barq exists on the device, `false` if not.
   */
  public static exists(path: string): boolean;
  /**
   * Checks if the Barq already exists on disk.
   * @param config - The configuration of a Barq.
   * @throws An {@link Error} if anything in the provided {@link config} is invalid.
   * @returns `true` if the Barq exists on the device, `false` if not.
   */
  public static exists(config: Configuration): boolean;
  public static exists(arg: Configuration | string = {}): boolean {
    const config = typeof arg === "string" ? { path: arg } : arg;
    validateConfiguration(config);
    const path = Barq.determinePath(config);
    return fs.exists(path);
  }

  /**
   * Open the default Barq asynchronously with a promise.
   * @returns A promise that will be resolved with the Barq instance when it's available.
   */
  public static open(): ProgressBarqPromise;

  /**
   * Open a Barq asynchronously with a promise. If the Barq is synced, it will be fully
   * synchronized before it is available.
   * @param path - The path for the Barq.
   * @returns A promise that will be resolved with the Barq instance when it's available.
   */
  public static open(path: string): ProgressBarqPromise;

  /**
   * Open a Barq asynchronously with a promise. If the Barq is synced, it will be fully
   * synchronized before it is available.
   * In the case of query-based sync, {@link Configuration.schema} is required. An exception will be
   * thrown if {@link Configuration.schema} is not defined.
   * @param config - The configuration for the Barq.
   * @returns A promise that will be resolved with the Barq instance when it's available.
   * @throws An {@link Error} if anything in the provided {@link config} is invalid.
   */
  public static open(config: Configuration): ProgressBarqPromise;

  public static open(arg: Configuration | string = {}): ProgressBarqPromise {
    const config = typeof arg === "string" ? { path: arg } : arg;
    return new ProgressBarqPromise(config);
  }

  /**
   * Get the current schema version of the Barq at the given path.
   * @param path - The path to the file where the Barq database is stored.
   * @param encryptionKey - Required only when accessing encrypted Barqs.
   * @throws An {@link Error} if passing an invalid or non-matching encryption key.
   * @returns Version of the schema as an integer, or `-1` if no Barq exists at {@link path}.
   * @since 0.11.0
   */
  public static schemaVersion(path: string, encryptionKey?: ArrayBuffer | ArrayBufferView): number {
    const notFound = "18446744073709551615"; // std::numeric_limit<uint64_t>::max() = 0xffffffffffffffff as string
    const config: Configuration = { path };
    const absolutePath = Barq.determinePath(config);
    const schemaVersion = binding.Barq.getSchemaVersion({
      path: absolutePath,
      encryptionKey: Barq.determineEncryptionKey(encryptionKey),
    });
    // no easy way to compare uint64_t in TypeScript
    return notFound === schemaVersion.toString() ? -1 : binding.Int64.intToNum(schemaVersion);
  }

  /**
   * Creates a template object for a Barq model class where all optional fields are undefined
   * and all required fields have the default value for the given data type, either the value
   * set by the default property in the schema or the default value for the datatype if the schema
   * doesn't specify one, i.e. 0, false and "".
   * @param objectSchema - Schema describing the object that should be created.
   */
  public static createTemplateObject<T extends Record<string, unknown>>(objectSchema: ObjectSchema): T {
    validateObjectSchema(objectSchema);
    const normalizedSchema = normalizeObjectSchema(objectSchema);
    const result: Record<string, unknown> = {};

    for (const [key, property] of Object.entries(normalizedSchema.properties)) {
      // If a default value is explicitly set, always set the property
      if (typeof property.default !== "undefined") {
        result[key] = property.default;
        continue;
      }
      // if optional is set, it wil take precedence over any `?` set on the type parameter
      if (property.optional) {
        continue;
      }

      // Set the default value for all required primitive types.
      // Lists are always treated as empty if not specified and references to objects are always optional
      switch (property.type) {
        case "bool":
          result[key] = false;
          break;
        case "int":
          result[key] = 0;
          break;
        case "float":
          result[key] = 0.0;
          break;
        case "double":
          result[key] = 0.0;
          break;
        case "string":
          result[key] = "";
          break;
        case "data":
          result[key] = new ArrayBuffer(0);
          break;
        case "date":
          result[key] = new Date(0);
          break;
      }
    }
    return result as T;
  }

  /**
   * Copy any Barq files  (i.e. `*.realm`) bundled with the application from the application
   * directory into the application's documents directory, so that they can be opened and used
   * by Barq. If the file already exists in the documents directory, it will not be
   * overwritten, so this can safely be called multiple times.
   *
   * This should be called before opening the Barq, in order to move the bundled Barq
   * files into a place where they can be written to.
   * @example
   * ```
   * // Given a bundled file, example.realm, this will copy example.realm (and any other .realm files)
   * // from the app bundle into the app's documents directory. If the file already exists, it will
   * // not be overwritten, so it is safe to call this every time the app starts.
   * Barq.copyBundledBarqFiles();
   *
   * const realm = await Barq.open({
   * // This will open example.realm from the documents directory, with the bundled data in.
   * path: "example.realm"
   * });
   * ```
   *
   * This is only implemented for React Native.
   * @throws an {@link Error} If an I/O error occurred or method is not implemented.
   */
  public static copyBundledBarqFiles() {
    fs.copyBundledBarqFiles();
  }

  /**
   * TODO: Consider breaking this by ensuring a ".realm" suffix (coordinating with other SDK teams in the process)
   */
  private static normalizePath(path: string | undefined): string {
    if (typeof path === "undefined") {
      return Barq.defaultPath;
    } else if (path.length === 0) {
      throw new Error("Unexpected empty path");
    } else if (fs.isAbsolutePath(path)) {
      return path;
    } else {
      return fs.joinPaths(fs.getDefaultDirectoryPath(), path);
    }
  }

  /**
   * @note When the path is relative and the config contains a sync object, Core will replace any existing file extension
   * or add the ".realm" suffix.
   */
  private static determinePath(config: Configuration): string {
    if (config.sync && !config.openSyncedBarqLocally) {
      if (config.path && fs.isAbsolutePath(config.path)) {
        return Barq.normalizePath(config.path);
      } else {
        const bindingSyncConfig = toBindingSyncConfig(config.sync);
        return config.sync.user.internal.pathForBarq(bindingSyncConfig, config.path);
      }
    } else {
      return Barq.normalizePath(config.path);
    }
  }

  private static determineEncryptionKey(encryptionKey: Configuration["encryptionKey"]): ArrayBuffer | undefined {
    if (typeof encryptionKey === "undefined") {
      return encryptionKey;
    } else {
      return toArrayBuffer(encryptionKey, false);
    }
  }

  private static extractBarqSchemaExtras(schemas: CanonicalObjectSchema[]): BarqSchemaExtra {
    const extras: BarqSchemaExtra = {};
    for (const schema of schemas) {
      extras[schema.name] = this.extractObjectSchemaExtras(schema);
    }

    return extras;
  }

  /** @internal */
  private static extractObjectSchemaExtras(schema: CanonicalObjectSchema): ObjectSchemaExtra {
    const defaults: Record<string, unknown> = {};
    const presentations: Record<string, PresentationPropertyTypeName | undefined> = {};

    for (const [name, propertySchema] of Object.entries(schema.properties)) {
      defaults[name] = propertySchema.default;
      presentations[name] = propertySchema.presentation;
    }

    return { constructor: schema.ctor, defaults, presentations };
  }

  /** @internal */
  public static transformConfig(config: Configuration): {
    schemaExtras: BarqSchemaExtra;
    bindingConfig: binding.BarqConfig_Relaxed;
  } {
    const normalizedSchema = config.schema && normalizeBarqSchema(config.schema);
    const schemaExtras = Barq.extractBarqSchemaExtras(normalizedSchema || []);
    const path = Barq.determinePath(config);
    const { fifoFilesFallbackPath, shouldCompact, inMemory } = config;
    const bindingSchema = normalizedSchema && toBindingSchema(normalizedSchema);
    return {
      schemaExtras,
      bindingConfig: {
        path,
        cache: true,
        fifoFilesFallbackPath,
        schema: bindingSchema,
        inMemory: inMemory === true,
        schemaMode: Barq.determineSchemaMode(config),
        schemaVersion: config.schema
          ? binding.Int64.numToInt(typeof config.schemaVersion === "number" ? config.schemaVersion : 0)
          : undefined,
        migrationFunction: config.onMigration ? Barq.wrapMigration(schemaExtras, config.onMigration) : undefined,
        shouldCompactOnLaunchFunction: shouldCompact
          ? (totalBytes, usedBytes) => {
              return shouldCompact(Number(totalBytes), Number(usedBytes));
            }
          : undefined,
        disableFormatUpgrade: config.disableFormatUpgrade,
        encryptionKey: Barq.determineEncryptionKey(config.encryptionKey),
        syncConfig: config.sync ? toBindingSyncConfig(config.sync) : undefined,
        forceSyncHistory: config.openSyncedBarqLocally,
        automaticallyHandleBacklinksInMigrations: config.migrationOptions?.resolveEmbeddedConstraints ?? false,
      },
    };
  }

  private static determineSchemaMode(config: Configuration): binding.SchemaMode | undefined {
    const { readOnly, deleteBarqIfMigrationNeeded, onMigration, sync } = config;
    assert(
      !readOnly || !deleteBarqIfMigrationNeeded,
      "Cannot set 'deleteBarqIfMigrationNeeded' when 'readOnly' is set.",
    );
    assert(
      !onMigration || !deleteBarqIfMigrationNeeded,
      "Cannot set 'deleteBarqIfMigrationNeeded' when 'onMigration' is set.",
    );
    if (readOnly) {
      return binding.SchemaMode.Immutable;
    } else if (deleteBarqIfMigrationNeeded) {
      return binding.SchemaMode.SoftResetFile;
    } else if (sync) {
      return binding.SchemaMode.AdditiveExplicit;
    } else {
      return undefined;
    }
  }

  private static wrapMigration(
    schemaExtras: BarqSchemaExtra,
    onMigration: MigrationCallback,
  ): binding.BarqConfig_Relaxed["migrationFunction"] {
    return (oldBarqInternal: binding.Barq, newBarqInternal: binding.Barq) => {
      try {
        const oldBarq = new Barq(null, { internal: oldBarqInternal, schemaExtras });
        const newBarq = new Barq(null, { internal: newBarqInternal, schemaExtras });
        onMigration(oldBarq, newBarq);
      } finally {
        oldBarqInternal.close();
        oldBarqInternal.$resetSharedPtr();
        newBarqInternal.$resetSharedPtr();
      }
    };
  }

  /**
   * The Barqs's representation in the binding.
   * @internal
   */
  public readonly internal: binding.Barq;

  /**
   * The sync session if this is a synced Barq
   */
  public readonly syncSession: SyncSession | null;

  private schemaExtras: BarqSchemaExtra = {};
  private classes: ClassMap;
  private changeListeners = new BarqListeners(this, BarqEvent.Change);
  private beforeNotifyListeners = new BarqListeners(this, BarqEvent.BeforeNotify);
  private schemaListeners = new BarqListeners(this, BarqEvent.Schema);
  /** @internal */
  public currentUpdateMode: UpdateMode | undefined;

  /**
   * Create a new {@link Barq} instance, at the default path.
   * @throws An {@link Error} when an incompatible synced Barq is opened.
   */
  constructor();
  /**
   * Create a new {@link Barq} instance at the provided {@link path}.
   * @param path - Required when first creating the Barq.
   * @throws An {@link Error} if the Barq cannot be opened at the provided {@link path}.
   * @throws An {@link Error} when an incompatible synced Barq is opened.
   */
  constructor(path: string);
  /**
   * Create a new {@link Barq} instance using the provided {@link config}. If a Barq does not yet exist
   * at {@link Configuration.path | config.path} (or {@link Barq.defaultPath} if not provided), then this constructor
   * will create it with the provided {@link Configuration.schema | config.schema} (which is _required_ in this case).
   * Otherwise, the instance will access the existing Barq from the file at that path.
   * In this case, {@link Configuration.schema | config.schema} is _optional_ or not have changed, unless
   * {@link Configuration.schemaVersion | config.schemaVersion} is incremented, in which case the Barq will be automatically
   * migrated to use the new schema.
   * In the case of query-based sync, {@link Configuration.schema | config.schema} is required. An exception will be
   * thrown if {@link Configuration.schema | config.schema} is not defined.
   * @param config - Required when first creating the Barq.
   * @throws An {@link Error} if anything in the provided {@link config} is invalid.
   * @throws An {@link Error} when an incompatible synced Barq is opened.
   */
  constructor(config: Configuration);
  /** @internal */
  constructor(config: Configuration | null, internalConfig: InternalConfig);
  constructor(arg?: Configuration | string | null, internalConfig: InternalConfig = {}) {
    const config = typeof arg === "string" ? { path: arg } : arg || {};
    // Calling `Barq.exists()` before `binding.Barq.getSharedBarq()` is necessary to capture
    // the correct value when this constructor was called since `binding.Barq.getSharedBarq()`
    // will open the realm. This is needed when deciding whether to update initial subscriptions.
    const realmExists = internalConfig.realmExists ?? Barq.exists(config);
    if (arg !== null) {
      assert(!internalConfig.schemaExtras, "Expected either a configuration or schemaExtras");
      validateConfiguration(config);
      const { bindingConfig, schemaExtras } = Barq.transformConfig(config);
      debug("open", bindingConfig);

      this.schemaExtras = schemaExtras;
      fs.ensureDirectoryForFile(bindingConfig.path);
      this.internal = internalConfig.internal ?? binding.Barq.getSharedBarq(bindingConfig);
      if (flags.ALLOW_CLEAR_TEST_STATE) {
        Barq.internals.add(new binding.WeakRef(this.internal));
      }

      binding.Helpers.setBindingContext(this.internal, {
        didChange: (r) => {
          r.verifyOpen();
          this.changeListeners.notify();
        },
        schemaDidChange: (r) => {
          r.verifyOpen();
          this.classes = new ClassMap(this, this.internal.schema, this.schema);
          this.schemaListeners.notify(this.schema);
        },
        beforeNotify: (r) => {
          r.verifyOpen();
          this.beforeNotifyListeners.notify();
        },
      });
    } else {
      const { internal, schemaExtras } = internalConfig;
      assert.instanceOf(internal, binding.Barq, "internal");
      this.internal = internal;
      this.schemaExtras = schemaExtras || {};
    }

    // Optionally: Exclude or include Barq files from iCloud backup
    const { excludeFromIcloudBackup } = config;
    if (typeof excludeFromIcloudBackup === "boolean") {
      const realmPath = this.internal.config.path;
      for (const fileNameSuffix of ["", ".lock", ".note", ".management"]) {
        const filePath = realmPath + fileNameSuffix;
        binding.JsPlatformHelpers.excludeFromIcloudBackup(filePath, excludeFromIcloudBackup);
      }
    }

    Object.defineProperty(this, "classes", {
      enumerable: false,
      configurable: false,
      writable: true,
    });
    Object.defineProperty(this, "internal", {
      enumerable: false,
      configurable: false,
      writable: false,
    });

    this.classes = new ClassMap(this, this.internal.schema, this.schema);

    const syncSession = this.internal.syncSession;
    this.syncSession = syncSession ? new SyncSession(syncSession) : null;

    const initialSubscriptions = config.sync?.initialSubscriptions;
    if (initialSubscriptions && !config.openSyncedBarqLocally) {
      // Do not call `Barq.exists()` here in case the realm has been opened by this point in time.
      this.handleInitialSubscriptions(initialSubscriptions, realmExists);
    }
  }

  /**
   * Indicates if this Barq contains any objects.
   * @returns `true` if empty, `false` otherwise.
   * @readonly
   * @since 1.10.0
   */
  get isEmpty(): boolean {
    return this.internal.isEmpty;
  }

  /**
   * The path to the file where this Barq is stored.
   * @returns A string containing the path to the file where this Barq is stored.
   * @readonly
   * @since 0.12.0
   */
  get path(): string {
    return this.internal.config.path;
  }

  /**
   * Indicates if this Barq was opened as read-only.
   * @returns `true` if this Barq is read-only, `false` otherwise.
   * @readonly
   * @since 0.12.0
   */
  get isReadOnly(): boolean {
    return this.internal.config.schemaMode === binding.SchemaMode.Immutable;
  }

  /**
   * Indicates if this Barq was opened in-memory.
   * @returns `true` if this Barq is in-memory, `false` otherwise.
   * @readonly
   */
  get isInMemory(): boolean {
    return this.internal.config.inMemory;
  }

  /**
   * A normalized representation of the schema provided in the {@link Configuration} when this Barq was constructed.
   * @returns An array of {@link CanonicalObjectSchema} describing all objects in this Barq.
   * @readonly
   * @since 0.12.0
   */
  get schema(): CanonicalObjectSchema[] {
    const schemas = fromBindingBarqSchema(this.internal.schema);
    // Stitch in the constructors and defaults stored in this.schemaExtras
    for (const objectSchema of schemas) {
      const extras = this.schemaExtras[objectSchema.name];
      if (extras) {
        objectSchema.ctor = extras.constructor;
      }
      for (const property of Object.values(objectSchema.properties)) {
        property.default = extras ? extras.defaults[property.name] : undefined;
        property.presentation = extras ? extras.presentations[property.name] : undefined;
      }
    }
    return schemas;
  }

  /**
   * The current schema version of the Barq.
   * @returns The schema version of this Barq, as a `number`.
   * @readonly
   * @since 0.12.0
   */
  get schemaVersion(): number {
    return Number(this.internal.schemaVersion);
  }

  /**
   * Indicates if this Barq is in a write transaction.
   * @returns `true` if in a write transaction, `false` otherwise.
   * @readonly
   * @since 1.10.3
   */
  get isInTransaction(): boolean {
    // TODO: Consider keeping a local state in JS for this
    return this.internal.isInTransaction;
  }

  /**
   * Indicates if this Barq is in migration.
   * @returns `true` if in migration, `false` otherwise
   * @readonly
   * @since 12.3.0
   */
  get isInMigration(): boolean {
    // TODO: Consider keeping a local state in JS for this
    return this.internal.isInMigration;
  }

  /**
   * Indicates if this Barq has been closed.
   * @returns `true` if closed, `false` otherwise.
   * @readonly
   * @since 2.1.0
   */
  get isClosed(): boolean {
    // TODO: Consider keeping a local state in JS for this
    return this.internal.isClosed;
  }

  /**
   * The latest set of flexible sync subscriptions.
   * @returns A {@link SubscriptionSet} object.
   * @throws An {@link Error} if flexible sync is not enabled for this app.
   */
  get subscriptions(): SubscriptionSet {
    const { syncConfig } = this.internal.config;
    assert(
      syncConfig,
      "`subscriptions` can only be accessed if flexible sync is enabled, but sync is " +
        "currently disabled for your app. Add a flexible sync config when opening the " +
        "Barq, for example: { sync: { user, flexible: true } }.",
    );
    assert(
      syncConfig.flxSyncRequested,
      "`subscriptions` can only be accessed if flexible sync is enabled, but partition " +
        "based sync is currently enabled for your Barq. Modify your sync config to remove any `partitionValue` " +
        "and enable flexible sync, for example: { sync: { user, flexible: true } }",
    );

    return new SubscriptionSet(this, this.internal.latestSubscriptionSet);
  }

  /**
   * Closes this Barq so it may be re-opened with a newer schema version.
   * All objects and collections from this Barq are no longer valid after calling this method.
   * The method is idempotent.
   */
  close(): void {
    this.internal.close();
  }

  // TODO: Support embedded objects
  // TODO: Rollback by deleting the object if any property assignment fails (fixing #2638)
  /**
   * Create a new {@link BarqObject} of the given type and with the specified properties. For objects marked asymmetric,
   * `undefined` is returned. The API for asymmetric objects is subject to changes in the future.
   * @param type - The type of Barq object to create.
   * @param values - Property values for all required properties without a
   * default value.
   * @param mode Optional update mode. The default is `UpdateMode.Never`.
   * @returns A {@link BarqObject} or `undefined` if the object is asymmetric.
   */
  create<T = DefaultObject>(
    type: string,
    values: Partial<T> | Partial<Unmanaged<T>>,
    mode?: UpdateMode.Never | UpdateMode.All | UpdateMode.Modified | boolean,
  ): BarqObject<T> & T;
  create<T extends AnyBarqObject>(
    type: Constructor<T>,
    values: Partial<T> | Partial<Unmanaged<T>>,
    mode?: UpdateMode.Never | UpdateMode.All | UpdateMode.Modified | boolean,
  ): T;
  create<T extends AnyBarqObject>(
    type: string | Constructor<T>,
    values: DefaultObject,
    mode: UpdateMode | boolean = UpdateMode.Never,
  ): BarqObject<DefaultObject, never> | undefined {
    // Supporting a boolean overload for mode
    if (mode === true) {
      mode = UpdateMode.All;
    } else if (mode === false) {
      mode = UpdateMode.Never;
    }
    // Implements https://github.com/BarqDB/barq-js/blob/v11/src/js_realm.hpp#L1260-L1321
    if (values instanceof BarqObject && !values[OBJECT_INTERNAL]) {
      throw new Error("Cannot create an object from a detached BarqObject instance");
    }
    if (!Object.values(UpdateMode).includes(mode)) {
      throw new Error(
        `Unsupported 'updateMode'. Only '${UpdateMode.Never}', '${UpdateMode.Modified}' or '${UpdateMode.All}' is supported.`,
      );
    }
    this.internal.verifyOpen();
    const helpers = this.classes.getHelpers(type);

    this.currentUpdateMode = mode;
    let realmObject: BarqObject;
    try {
      realmObject = BarqObject.create(this, values, mode, { helpers });
    } finally {
      this.currentUpdateMode = undefined;
    }

    return isAsymmetric(helpers.objectSchema) ? undefined : realmObject;
  }

  //FIXME: any should not be used, but we are staying compatible with previous versions
  /**
   * Deletes the provided Barq object, or each one inside the provided collection.
   * @param subject - The Barq object to delete, or a collection containing multiple Barq objects to delete.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(subject: AnyBarqObject | AnyBarqObject[] | AnyList | AnyResults | any): void {
    assert.inTransaction(this, "Can only delete objects within a transaction.");
    assert.object(subject, "subject");
    if (subject instanceof BarqObject) {
      assert.isSameBarq(subject[OBJECT_REALM].internal, this.internal, "Can't delete an object from another Barq");
      const { objectSchema } = this.classes.getHelpers(subject);
      const obj = subject[OBJECT_INTERNAL];
      assert.isValid(
        obj,
        "Object is invalid. Either it has been previously deleted or the Barq it belongs to has been closed.",
      );
      const table = binding.Helpers.getTable(this.internal, objectSchema.tableKey);
      table.removeObject(obj.key);
    } else if (subject instanceof List) {
      subject.internal.deleteAll();
    } else if (subject instanceof Results) {
      subject.internal.clear();
    } else if (Array.isArray(subject) || Symbol.iterator in subject) {
      //@ts-expect-error the above check is good enough
      for (const object of subject) {
        assert.instanceOf(object, BarqObject);
        assert.isSameBarq(object[OBJECT_REALM].internal, this.internal, "Can't delete an object from another Barq");
        const { objectSchema } = this.classes.getHelpers(object);
        const table = binding.Helpers.getTable(this.internal, objectSchema.tableKey);
        table.removeObject(object[OBJECT_INTERNAL].key);
      }
    } else {
      throw new Error("Can only delete objects, lists and results.");
    }
  }

  /**
   * Deletes a Barq model, including all of its objects.
   * If called outside a migration function, {@link schema} and {@link schemaVersion} are updated.
   * @param name - The model name.
   */
  deleteModel(name: string): void {
    assert.inTransaction(this, "Can only delete objects within a transaction.");
    binding.Helpers.deleteDataForObject(this.internal, name);
    if (!this.internal.isInMigration) {
      const newSchema = this.internal.schema.filter((objectSchema) => objectSchema.name !== name);
      this.internal.updateSchema(
        newSchema,
        binding.Int64.add(this.internal.schemaVersion, binding.Int64.numToInt(1)),
        null,
        null,
        true,
      );
    }
  }

  /**
   * **WARNING:** This will delete **all** objects in the Barq!
   */
  deleteAll(): void {
    assert.inTransaction(this, "Can only delete objects within a transaction.");
    for (const objectSchema of this.internal.schema) {
      const table = binding.Helpers.getTable(this.internal, objectSchema.tableKey);
      table.clear();
    }
  }

  /**
   * Searches for a Barq object by its primary key.
   * @param type - The type of Barq object to search for.
   * @param primaryKey - The primary key value of the object to search for.
   * @throws An {@link Error} if type passed into this method is invalid, or if the object type did
   * not have a {@link primaryKey} specified in the schema, or if it was marked asymmetric.
   * @returns A {@link BarqObject} or `null` if no object is found.
   * @since 0.14.0
   */
  objectForPrimaryKey<T = DefaultObject>(type: string, primaryKey: T[keyof T]): (BarqObject<T> & T) | null;
  objectForPrimaryKey<T extends AnyBarqObject>(type: Constructor<T>, primaryKey: T[keyof T]): T | null;
  objectForPrimaryKey<T extends AnyBarqObject>(type: string | Constructor<T>, primaryKey: unknown): T | null {
    // Implements https://github.com/BarqDB/barq-js/blob/v11/src/js_realm.hpp#L1240-L1258
    const { objectSchema, properties, wrapObject } = this.classes.getHelpers(type);
    if (!objectSchema.primaryKey) {
      throw new Error(`Expected a primary key on '${objectSchema.name}'`);
    }
    if (isAsymmetric(objectSchema)) {
      throw new Error("You cannot query an asymmetric object.");
    }
    const table = binding.Helpers.getTable(this.internal, objectSchema.tableKey);
    const value = properties.get(objectSchema.primaryKey).toBinding(primaryKey);
    try {
      const objKey = table.findPrimaryKey(value);
      if (binding.isEmptyObjKey(objKey)) {
        return null;
      } else {
        const obj = table.getObject(objKey);
        return wrapObject(obj) as T;
      }
    } catch (err) {
      // TODO: Match on something else than the error message, when exposed by the binding
      if (err instanceof Error && err.message.startsWith("No object with key")) {
        throw new Error(`No '${objectSchema.name}' with key '${primaryKey}'`);
      } else {
        throw err;
      }
    }
  }

  /**
   * Returns all objects of the given {@link type} in the Barq.
   * @param type - The type of Barq object to search for.
   * @param objectKey - The object key of the Barq object to search for.
   * @throws An {@link Error} if type passed into this method is invalid or if the type is marked embedded or asymmetric.
   * @returns A {@link BarqObject} or `undefined` if the object key is not found.
   * @internal
   */
  _objectForObjectKey<T = DefaultObject>(type: string, objectKey: string): (BarqObject<T> & T) | undefined;
  _objectForObjectKey<T extends BarqObject>(type: Constructor<T>, objectKey: string): T | undefined;
  _objectForObjectKey<T extends BarqObject>(type: string | Constructor<T>, objectKey: string): T | undefined {
    const { objectSchema, wrapObject } = this.classes.getHelpers(type);
    if (isEmbedded(objectSchema)) {
      throw new Error("You cannot query an embedded object.");
    } else if (isAsymmetric(objectSchema)) {
      throw new Error("You cannot query an asymmetric object.");
    }

    assert.numericString(objectKey);

    const table = binding.Helpers.getTable(this.internal, objectSchema.tableKey);
    try {
      const objKey = binding.stringToObjKey(objectKey);
      const obj = table.tryGetObject(objKey);
      const result = obj && (wrapObject(obj) as T);
      return result === null ? undefined : result;
    } catch (err) {
      if (err instanceof binding.InvalidObjKey) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  /**
   * Returns all objects of the given {@link type} in the Barq.
   * @param type - The type of Barq objects to retrieve.
   * @throws An {@link Error} if type passed into this method is invalid or if the type is marked embedded or asymmetric.
   * @returns Results that will live-update as objects are created, modified, and destroyed.
   */
  objects<T = DefaultObject>(type: string): Results<BarqObject<T> & T>;
  objects<T extends AnyBarqObject = BarqObject & DefaultObject>(type: Constructor<T>): Results<T>;
  objects<T extends AnyBarqObject>(type: string | Constructor<T>): Results<T> {
    const { internal, classes } = this;
    const { objectSchema, wrapObject } = classes.getHelpers(type);
    if (isEmbedded(objectSchema)) {
      throw new Error("You cannot query an embedded object.");
    } else if (isAsymmetric(objectSchema)) {
      throw new Error("You cannot query an asymmetric object.");
    }

    const table = binding.Helpers.getTable(internal, objectSchema.tableKey);
    const results = binding.Results.fromTable(internal, table);
    const typeHelpers: TypeHelpers<T> = {
      fromBinding(value) {
        return wrapObject(value as binding.Obj) as T;
      },
      toBinding(value) {
        assert.instanceOf(value, BarqObject);
        return value[OBJECT_INTERNAL];
      },
    };
    const accessor = createResultsAccessor<T>({ realm: this, typeHelpers, itemType: binding.PropertyType.Object });
    return new Results<T>(this, results, accessor, typeHelpers);
  }

  /**
   * Add a listener {@link callback} for the specified {@link eventName}.
   * @param eventName - The name of event that should cause the callback to be called.
   * @param callback - Function to be called when a change event occurs.
   * Each callback will only be called once per event, regardless of the number of times
   * it was added.
   * @throws An {@link Error} if an invalid event {@link eventName} is supplied, if Barq is closed or if {@link callback} is not a function.
   */
  addListener(eventName: BarqEventName, callback: BarqListenerCallback): void {
    assert.open(this);
    assert.function(callback);
    if (eventName === "change") {
      this.changeListeners.add(callback);
    } else if (eventName === "schema") {
      this.schemaListeners.add(callback);
    } else if (eventName === "beforenotify") {
      this.beforeNotifyListeners.add(callback);
    } else {
      throw new Error(`Unknown event name '${eventName}': only 'change', 'schema' and 'beforenotify' are supported.`);
    }
  }

  /**
   * Remove the listener {@link callback} for the specified event {@link eventName}.
   * @param eventName - The event name.
   * @param callback - Function that was previously added as a listener for this event through the {@link addListener} method.
   * @throws an {@link Error} If an invalid event {@link eventName} is supplied, if Barq is closed or if {@link callback} is not a function.
   */
  removeListener(eventName: BarqEventName, callback: BarqListenerCallback): void {
    assert.open(this);
    assert.function(callback);
    assertBarqEvent(eventName);
    if (eventName === BarqEvent.Change) {
      this.changeListeners.remove(callback);
    } else if (eventName === BarqEvent.Schema) {
      this.schemaListeners.remove(callback);
    } else if (eventName === BarqEvent.BeforeNotify) {
      this.beforeNotifyListeners.remove(callback);
    } else {
      assert.never(eventName, "eventName");
    }
  }

  /**
   * Remove all event listeners (restricted to the event {@link eventName}, if provided).
   * @param eventName - The name of the event whose listeners should be removed.
   * @throws An {@link Error} when invalid event {@link eventName} is supplied.
   */
  removeAllListeners(eventName?: BarqEventName): void {
    assert.open(this);
    if (typeof eventName === "undefined") {
      this.changeListeners.removeAll();
      this.schemaListeners.removeAll();
      this.beforeNotifyListeners.removeAll();
    } else {
      assert.string(eventName, "eventName");
      assertBarqEvent(eventName);
      if (eventName === BarqEvent.Change) {
        this.changeListeners.removeAll();
      } else if (eventName === BarqEvent.Schema) {
        this.schemaListeners.removeAll();
      } else if (eventName === BarqEvent.BeforeNotify) {
        this.beforeNotifyListeners.removeAll();
      } else {
        assert.never(eventName, "eventName");
      }
    }
  }

  /**
   * Synchronously call the provided {@link callback} inside a write transaction. If an exception happens inside a transaction,
   * you’ll lose the changes in that transaction, but the Barq itself won’t be affected (or corrupted).
   * More precisely, {@link beginTransaction} and {@link commitTransaction} will be called
   * automatically. If any exception is thrown during the transaction {@link cancelTransaction} will
   * be called instead of {@link commitTransaction} and the exception will be re-thrown to the caller of {@link write}.
   *
   * Nested transactions (calling {@link write} within {@link write}) is not possible.
   * @param callback - Function to be called inside a write transaction.
   * @returns Returned value from the callback.
   */
  write<T>(callback: () => T): T {
    let result = undefined;
    this.internal.beginTransaction();
    try {
      result = callback();
    } catch (err) {
      this.internal.cancelTransaction();
      throw err;
    }
    this.internal.commitTransaction();
    return result;
  }

  /**
   * Initiate a write transaction.
   *
   * When doing a transaction, it is highly recommended to do error handling.
   * If you don't handle errors, your data might become inconsistent. Error handling
   * will often involve canceling the transaction.
   * @throws An {@link Error} if already in write transaction
   * @see {@link cancelTransaction}
   * @see {@link commitTransaction}
   * @example
   * realm.beginTransaction();
   * try {
   *   realm.create('Person', { name: 'Arthur Dent',  origin: 'Earth' });
   *   realm.create('Person', { name: 'Ford Prefect', origin: 'Betelgeuse Five' });
   *   realm.commitTransaction();
   * } catch (e) {
   *   realm.cancelTransaction();
   *   throw e;
   * }
   */
  beginTransaction(): void {
    this.internal.beginTransaction();
  }

  /**
   * Commit a write transaction.
   * @see {@link beginTransaction}
   */
  commitTransaction(): void {
    this.internal.commitTransaction();
  }

  /**
   * Cancel a write transaction.
   * @see {@link beginTransaction}
   */
  cancelTransaction(): void {
    this.internal.cancelTransaction();
  }

  /**
   * Replaces all string columns in this Barq with a string enumeration column and compacts the
   * database file.
   *
   * Cannot be called from a write transaction.
   *
   * Compaction will not occur if other {@link Barq} instances exist.
   *
   * While compaction is in progress, attempts by other threads or processes to open the database will
   * wait.
   *
   * Be warned that resource requirements for compaction is proportional to the amount of live data in
   * the database. Compaction works by writing the database contents to a temporary database file and
   * then replacing the database with the temporary one.
   * @returns `true` if compaction succeeds, `false` if not.
   */
  compact(): boolean {
    assert.outTransaction(this, "Cannot compact a Barq within a transaction.");
    return this.internal.compact();
  }

  /**
   * Writes a compacted copy of the Barq with the given configuration.
   *
   * The destination file cannot already exist.
   * All conversions between synced and non-synced Barqs are supported, and will be
   * performed according to the {@link config} parameter, which describes the desired output.
   *
   * Note that if this method is called from within a write transaction, the current data is written,
   * not the data from the point when the previous write transaction was committed.
   * @param config - Barq configuration that describes the output realm.
   */
  writeCopyTo(config: Configuration): void {
    assert.outTransaction(this, "Can only convert Barqs outside a transaction.");
    validateConfiguration(config);
    const { bindingConfig } = Barq.transformConfig(config);
    this.internal.convert(bindingConfig);
  }

  /**
   * Update the schema of the Barq.
   * @param schema The schema which the Barq should be updated to use.
   * @internal
   */
  _updateSchema(schema: ObjectSchema[]): void {
    validateBarqSchema(schema);
    const normalizedSchema = normalizeBarqSchema(schema);
    const bindingSchema = toBindingSchema(normalizedSchema);
    if (!this.isInTransaction) {
      throw new Error("Can only create object schema within a transaction.");
    }
    this.internal.updateSchema(
      bindingSchema,
      binding.Int64.add(this.internal.schemaVersion, binding.Int64.numToInt(1)),
      null,
      null,
      true,
    );

    // Note: The schema change listener is fired immediately after the call to
    //       `this.internal.updateSchema()` (thus before `_updateSchema()` has
    //       returned). Therefore, `this.classes` is updated in the `schemaDidChange`
    //       callback and not here.
  }

  /** @internal */
  public getClassHelpers<T>(
    arg: string | binding.TableKey | BarqObject<T> | Constructor<BarqObject<T>>,
  ): ClassHelpers {
    return this.classes.getHelpers<T>(arg);
  }

  /**
   * Update subscriptions with the initial subscriptions if needed.
   * @param initialSubscriptions The initial subscriptions.
   * @param realmExists Whether the realm already exists.
   */
  private handleInitialSubscriptions(initialSubscriptions: InitialSubscriptions, realmExists: boolean): void {
    const shouldUpdateSubscriptions = initialSubscriptions.rerunOnOpen || !realmExists;
    if (shouldUpdateSubscriptions) {
      debug("handling initial subscriptions, %O", { rerunOnOpen: initialSubscriptions.rerunOnOpen, realmExists });
      this.subscriptions.updateNoWait(initialSubscriptions.update);
    }
  }
}

injectIndirect("Barq", Barq);

/**
 * @param objectSchema - The schema of the object.
 * @returns `true` if the object is marked for asymmetric sync, otherwise `false`.
 */
function isAsymmetric(objectSchema: binding.ObjectSchema): boolean {
  return objectSchema.tableType === binding.TableType.TopLevelAsymmetric;
}

/**
 * @param objectSchema - The schema of the object.
 * @returns `true` if the object is marked as embedded, otherwise `false`.
 */
function isEmbedded(objectSchema: binding.ObjectSchema): boolean {
  return objectSchema.tableType === binding.TableType.Embedded;
}

// Declare the Barq namespace for backwards compatibility
// This declaration needs to happen in the same file which declares "Barq"
// @see https://www.typescriptlang.org/docs/handbook/declaration-merging.html#merging-namespaces-with-classes-functions-and-enums

import * as ns from "./namespace";

// Needed to avoid complaints about a self-reference
import BarqItself = Barq;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Barq {
  export import Barq = BarqItself;
  export import flags = ns.flags;

  export import Object = ns.BarqObject;
  export import Types = ns.Types;

  export import index = ns.index;
  export import mapTo = ns.mapTo;
  export import kmToRadians = ns.kmToRadians;
  export import miToRadians = ns.miToRadians;

  export import AnyCollection = ns.AnyCollection;
  export import AnyDictionary = ns.AnyDictionary;
  export import AnyList = ns.AnyList;
  export import AnyBarqObject = ns.AnyBarqObject;
  export import AnyResults = ns.AnyResults;
  export import AnySet = ns.AnySet;
  export import AnyUser = ns.AnyUser;
  export import AssertionError = ns.AssertionError;
  export import BaseConfiguration = ns.BaseConfiguration;
  export import BaseObjectSchema = ns.BaseObjectSchema;
  export import BaseSyncConfiguration = ns.BaseSyncConfiguration;
  export import CanonicalGeoPoint = ns.CanonicalGeoPoint;
  export import CanonicalGeoPolygon = ns.CanonicalGeoPolygon;
  export import CanonicalObjectSchema = ns.CanonicalObjectSchema;
  export import CanonicalPropertiesTypes = ns.CanonicalPropertiesTypes;
  export import CanonicalPropertySchema = ns.CanonicalPropertySchema;
  export import ClientResetAfterCallback = ns.ClientResetAfterCallback;
  export import ClientResetBeforeCallback = ns.ClientResetBeforeCallback;
  export import ClientResetConfig = ns.ClientResetConfig;
  export import ClientResetDiscardUnsyncedChangesConfiguration = ns.ClientResetDiscardUnsyncedChangesConfiguration;
  export import ClientResetFallbackCallback = ns.ClientResetFallbackCallback;
  export import ClientResetManualConfiguration = ns.ClientResetManualConfiguration;
  export import ClientResetMode = ns.ClientResetMode;
  export import ClientResetRecoverOrDiscardUnsyncedChangesConfiguration = ns.ClientResetRecoverOrDiscardUnsyncedChangesConfiguration;
  export import ClientResetRecoverUnsyncedChangesConfiguration = ns.ClientResetRecoverUnsyncedChangesConfiguration;
  export import Collection = ns.Collection;
  export import CollectionChangeCallback = ns.CollectionChangeCallback;
  export import CollectionChangeSet = ns.CollectionChangeSet;
  export import CollectionPropertyTypeName = ns.CollectionPropertyTypeName;
  export import CompensatingWriteError = ns.CompensatingWriteError;
  export import CompensatingWriteInfo = ns.CompensatingWriteInfo;
  export import Configuration = ns.Configuration;
  export import ConfigurationWithoutSync = ns.ConfigurationWithoutSync;
  export import ConfigurationWithSync = ns.ConfigurationWithSync;
  export import ConnectionNotificationCallback = ns.ConnectionNotificationCallback;
  export import ConnectionState = ns.ConnectionState;
  export import Counter = ns.Counter;
  export import Dictionary = ns.Dictionary;
  export import DictionaryChangeCallback = ns.DictionaryChangeCallback;
  export import DictionaryChangeSet = ns.DictionaryChangeSet;
  export import ErrorCallback = ns.ErrorCallback;
  export import EstimateProgressNotificationCallback = ns.EstimateProgressNotificationCallback;
  export import FlexibleSyncConfiguration = ns.FlexibleSyncConfiguration;
  export import GeoBox = ns.GeoBox;
  export import GeoCircle = ns.GeoCircle;
  export import GeoPoint = ns.GeoPoint;
  export import GeoPolygon = ns.GeoPolygon;
  export import GeoPosition = ns.GeoPosition;
  export import IndexDecorator = ns.IndexDecorator;
  export import IndexedType = ns.IndexedType;
  export import InitialSubscriptions = ns.InitialSubscriptions;
  export import List = ns.List;
  export import LogCategory = ns.LogCategory;
  export import LogEntry = ns.LogEntry;
  export import Logger = ns.Logger;
  export import LoggerCallback = ns.LoggerCallback;
  export import LoggerCallback1 = ns.LoggerCallback1;
  export import LoggerCallback2 = ns.LoggerCallback2;
  export import MapToDecorator = ns.MapToDecorator;
  export import MigrationCallback = ns.MigrationCallback;
  export import MigrationOptions = ns.MigrationOptions;
  export import Mixed = ns.Types.Mixed;
  export import NumericLogLevel = ns.NumericLogLevel;
  export import ObjectChangeCallback = ns.ObjectChangeCallback;
  export import ObjectChangeSet = ns.ObjectChangeSet;
  export import ObjectSchema = ns.ObjectSchema;
  export import ObjectType = ns.ObjectType;
  export import OpenBarqBehaviorConfiguration = ns.OpenBarqBehaviorConfiguration;
  export import OpenBarqBehaviorType = ns.OpenBarqBehaviorType;
  export import OpenBarqTimeOutBehavior = ns.OpenBarqTimeOutBehavior;
  export import OrderedCollection = ns.OrderedCollection;
  export import PartitionSyncConfiguration = ns.PartitionSyncConfiguration;
  export import PresentationPropertyTypeName = ns.PresentationPropertyTypeName;
  export import PrimaryKey = ns.PrimaryKey;
  export import PrimitivePropertyTypeName = ns.PrimitivePropertyTypeName;
  export import ProgressDirection = ns.ProgressDirection;
  export import ProgressMode = ns.ProgressMode;
  export import ProgressNotificationCallback = ns.ProgressNotificationCallback;
  export import ProgressBarqPromise = ns.ProgressBarqPromise;
  export import PropertiesTypes = ns.PropertiesTypes;
  export import PropertySchema = ns.PropertySchema;
  export import PropertySchemaCommon = ns.PropertySchemaCommon;
  export import PropertySchemaParseError = ns.PropertySchemaParseError;
  export import PropertySchemaShorthand = ns.PropertySchemaShorthand;
  export import PropertySchemaStrict = ns.PropertySchemaStrict;
  export import PropertyTypeName = ns.PropertyTypeName;
  export import ProxyType = ns.ProxyType;
  export import BarqEvent = ns.BarqEvent;
  export import BarqEventName = ns.BarqEventName;
  export import BarqListenerCallback = ns.BarqListenerCallback;
  export import BarqObjectConstructor = ns.BarqObjectConstructor;
  export import RelationshipPropertyTypeName = ns.RelationshipPropertyTypeName;
  export import Results = ns.Results;
  export import SchemaParseError = ns.SchemaParseError;
  export import SessionState = ns.SessionState;
  export import SessionStopPolicy = ns.SessionStopPolicy;
  export import Set = ns.BarqSet;
  export import ShorthandPrimitivePropertyTypeName = ns.ShorthandPrimitivePropertyTypeName;
  export import SortDescriptor = ns.SortDescriptor;
  export import SSLConfiguration = ns.SSLConfiguration;
  export import SSLVerifyCallback = ns.SSLVerifyCallback;
  export import SSLVerifyObject = ns.SSLVerifyObject;
  export import SubscriptionSetState = ns.SubscriptionSetState;
  export import SyncConfiguration = ns.SyncConfiguration;
  export import SyncError = ns.SyncError;
  export import SyncProxyConfig = ns.SyncProxyConfig;
  export import TypeAssertionError = ns.TypeAssertionError;
  export import Unmanaged = ns.Unmanaged;
  export import UpdateMode = ns.UpdateMode;
  export import User = ns.User;
  export import UserChangeCallback = ns.UserChangeCallback;
  export import UserIdentity = ns.UserIdentity;
  export import UserState = ns.UserState;
  export import UserTypeName = ns.UserTypeName;
  export import WaitForSync = ns.WaitForSync;

  // Deprecated exports below
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.AppServicesFunction | AppServicesFunction} */
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.CanonicalPropertySchema | CanonicalPropertySchema} */
  export import CanonicalObjectSchemaProperty = ns.CanonicalPropertySchema;
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.ClientResetRecoverUnsyncedChangesConfiguration | ClientResetRecoverUnsyncedChangesConfiguration} */
  export import ClientResetRecoveryConfiguration = ns.ClientResetRecoverUnsyncedChangesConfiguration;
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.PropertySchema | PropertySchema} */
  export import ObjectSchemaProperty = ns.PropertySchema;
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.BarqObjectConstructor | BarqObjectConstructor} */
  export import ObjectClass = ns.BarqObjectConstructor;
  /** @deprecated Will be removed in a future major version. Please use {@link ns.EstimateProgressNotificationCallback | EstimateProgressNotificationCallback} */
  export import PartitionBasedSyncProgressNotificationCallback = ns.PartitionBasedSyncProgressNotificationCallback;
  /** @deprecated Will be removed in v13.0.0. Please use {@link ns.PropertyTypeName | PropertyTypeName} */
  export import PropertyType = ns.PropertyTypeName;
  /** @deprecated Use another {@link ns.ClientResetMode | ClientResetMode} than {@link ns.ClientResetMode.Manual | ClientResetMode.Manual}. */
  export import ClientResetError = ns.ClientResetError;
  /** @deprecated See https://github.com/BarqDB/barq-js */
}

// Set default logger and log level.
Barq.setLogger(defaultLogger);
Barq.setLogLevel(defaultLoggerLevel);
