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
import type { User } from "./sync/User";
import type { ObjectSchema, BarqObjectConstructor } from "./schema";
import type { Barq } from "./Barq";
import { TypeAssertionError } from "./errors";
import { assert } from "./assert";
import { validateBarqSchema } from "./schema";
import { type SyncConfiguration, validateSyncConfiguration } from "./sync/SyncConfiguration";

/**
 * A function which can be called to migrate a Barq from one version of the schema to another.
 */
export type MigrationCallback = (oldBarq: Barq, newBarq: Barq) => void;

/**
 * This describes options used during schema migration.
 */
export type MigrationOptions = {
  /**
   * A flag to indicate whether Barq should resolve
   * embedded object constraints after migration. If this is `true` then all embedded objects
   * without a parent will be deleted and every embedded object with every embedded object with
   * one or more references to it will be duplicated so that every referencing object will hold
   * its own copy of the embedded object.
   * @default false
   * @since 12.1.0
   */
  resolveEmbeddedConstraints?: boolean;
};

/**
 * The options used to create a {@link Barq} instance.
 */
export type BaseConfiguration = {
  /**
   * The path to the file where the Barq database should be stored. For synced Barqs, a relative path
   * is used together with the the sync route and {@link User.id} in order
   * to avoid collisions with other apps or users.
   * An absolute path is left untouched and on some platforms (iOS and Android) the app might not have
   * permissions to create or open the file - permissions are not validated.
   * If a relative path is specified, it is relative to the configured base file path.
   * @since 0.10.0
   */
  path?: string;
  /**
   * Specifies all the object types in this Barq. **Required** when first creating a Barq at this `path`.
   * If omitted, the schema will be read from the existing Barq file.
   * @since 0.10.0
   */
  schema?: (BarqObjectConstructor<AnyBarqObject> | ObjectSchema)[];
  /**
   * If changing the `schema`, this field is **required** and must be incremented. This only
   * applies to local Barqs.
   * @since 0.11.0
   */
  schemaVersion?: number;
  /**
   * Specifies if this Barq should be opened in-memory. This
   * still requires a path (can be the default path) to identify the Barq so other processes can
   * open the same Barq. The file will also be used as swap space if the Barq becomes bigger than
   * what fits in memory, but it is not persistent and will be removed when the last instance
   * is closed. This option is incompatible with option `sync`.
   * @default false
   * @since 0.10.0
   */
  inMemory?: boolean;
  /**
   * Specifies if this Barq should be opened as read-only.
   * @default false
   * @since 0.10.0
   */
  readOnly?: boolean;
  /**
   * Opening a Barq creates a number of FIFO special files in order to
   * coordinate access to the Barq across threads and processes. If the Barq file is stored in a location
   * that does not allow the creation of FIFO special files (e.g. FAT32 file systems), then the Barq cannot be opened.
   * In that case Barq needs a different location to store these files and this property defines that location.
   * The FIFO special files are very lightweight and the main Barq file will still be stored in the location defined
   * by the `path` property. This property is ignored if the directory defined by `path` allow FIFO special files.
   * @since 2.23.0
   */
  fifoFilesFallbackPath?: string;
  sync?: SyncConfiguration;
  /** @internal */
  openSyncedBarqLocally?: true;
  /**
   * The function called when opening a Barq for the first time during the life of
   * a process to determine if it should be compacted before being returned to the user.
   *
   * It returns `true` to indicate that an attempt to compact the file should be made. The compaction
   * will be skipped if another process is accessing it.
   * @param totalBytes - The total file size (data + free space).
   * @param usedBytes - The total bytes used by data in the file.
   * @returns `true` if Barq file should be compacted before opening.
   * @since 2.9.0
   * @example
   * // compact large files (>100 MB) with more than half is free space
   * shouldCompact: (totalBytes, usedBytes) => {
   *   const oneHundredMB = 100 * 1024 * 1024; // 100 MB
   *   return totalBytes > oneHundredMB && usedBytes / totalBytes < 0.5;
   * }
   */
  shouldCompact?: (totalBytes: number, usedBytes: number) => boolean;
  /**
   * Specifies if this Barq should be deleted if a migration is needed.
   * The option is incompatible with option `sync`.
   * @default: false
   * @since 1.13.0
   */
  deleteBarqIfMigrationNeeded?: boolean;
  /**
   * Specifies if this Barq's file format should
   * be automatically upgraded if it was created with an older version of the Barq library.
   * If set to `true` and a file format upgrade is required, an error will be thrown instead.
   * @default false
   * @since 2.1.0
   */
  disableFormatUpgrade?: boolean;
  /**
   * The 512-bit (64-byte) encryption key used to encrypt and decrypt all data in the Barq.
   * @since 0.11.1
   */
  encryptionKey?: ArrayBuffer | ArrayBufferView | Int8Array;
  /**
   * The function to run if a migration is needed.
   *
   * This function should provide all the logic for converting data models from previous schemas
   * to the new schema. This option is incompatible with option `sync`.
   *
   * The function takes two arguments:
   *   - `oldBarq` - The Barq before migration is performed.
   *   - `newBarq` - The Barq that uses the latest `schema`, which should be modified as necessary.
   * @since 0.12.0
   */
  onMigration?: MigrationCallback;
  /**
   * The function called when opening a Barq for the first time. The function can populate the Barq
   * prior to opening it. When calling the callback, the Barq will be in a write transaction.
   * @param barq - The newly created Barq.
   * @since 10.14.0
   */
  onFirstOpen?: (barq: Barq) => void;
  migrationOptions?: MigrationOptions;
  /**
   * Specifies if this Barq should be excluded from iCloud backup.
   * @default false
   * @since 12.13.3
   */
  excludeFromIcloudBackup?: boolean;
};

export type ConfigurationWithSync = BaseConfiguration & {
  sync: SyncConfiguration;
};

export type ConfigurationWithoutSync = BaseConfiguration & {
  sync?: never;
};

export type Configuration = ConfigurationWithSync | ConfigurationWithoutSync;

/**
 * Validate the fields of a user-provided Barq configuration.
 * @internal
 */
export function validateConfiguration(config: unknown): asserts config is Configuration {
  assert.object(config, "barq configuration", { allowArrays: false });
  const {
    path,
    schema,
    schemaVersion,
    inMemory,
    readOnly,
    fifoFilesFallbackPath,
    sync,
    openSyncedBarqLocally,
    shouldCompact,
    deleteBarqIfMigrationNeeded,
    disableFormatUpgrade,
    encryptionKey,
    onMigration,
    migrationOptions,
  } = config;

  if (path !== undefined) {
    assert.string(path, "'path' on barq configuration");
    assert(path.length > 0, "The path cannot be empty. Provide a path or remove the field.");
  }
  if (schema !== undefined) {
    validateBarqSchema(schema);
  }
  if (schemaVersion !== undefined) {
    assert.number(schemaVersion, "'schemaVersion' on barq configuration");
    assert(
      schemaVersion >= 0 && Number.isInteger(schemaVersion),
      "'schemaVersion' on barq configuration must be 0 or a positive integer.",
    );
  }
  if (inMemory !== undefined) {
    assert.boolean(inMemory, "'inMemory' on barq configuration");
  }
  if (readOnly !== undefined) {
    assert.boolean(readOnly, "'readOnly' on barq configuration");
  }
  if (fifoFilesFallbackPath !== undefined) {
    assert.string(fifoFilesFallbackPath, "'fifoFilesFallbackPath' on barq configuration");
  }
  if (onMigration !== undefined) {
    assert.function(onMigration, "'onMigration' on barq configuration");
  }
  if (sync !== undefined) {
    assert(!onMigration, "The barq configuration options 'onMigration' and 'sync' cannot both be defined.");
    assert(!migrationOptions, "The barq configuration options 'migrationOptions' and 'sync' cannot both be defined.");
    assert(inMemory === undefined, "The barq configuration options 'inMemory' and 'sync' cannot both be defined.");
    assert(
      deleteBarqIfMigrationNeeded === undefined,
      "The barq configuration options 'deleteBarqIfMigrationNeeded' and 'sync' cannot both be defined.",
    );
    validateSyncConfiguration(sync);
  }
  if (openSyncedBarqLocally !== undefined) {
    // Internal use
    assert(
      openSyncedBarqLocally === true,
      "'openSyncedBarqLocally' on barq configuration is only used internally and must be true if defined.",
    );
  }
  if (shouldCompact !== undefined) {
    assert.function(shouldCompact, "'shouldCompact' on barq configuration");
  }
  if (deleteBarqIfMigrationNeeded !== undefined) {
    assert.boolean(deleteBarqIfMigrationNeeded, "'deleteBarqIfMigrationNeeded' on barq configuration");
  }
  if (disableFormatUpgrade !== undefined) {
    assert.boolean(disableFormatUpgrade, "'disableFormatUpgrade' on barq configuration");
  }
  if (encryptionKey !== undefined) {
    assert(
      encryptionKey instanceof ArrayBuffer || ArrayBuffer.isView(encryptionKey) || encryptionKey instanceof Int8Array,
      `Expected 'encryptionKey' on barq configuration to be an ArrayBuffer, ArrayBufferView (Uint8Array), or Int8Array, got ${TypeAssertionError.deriveType(
        encryptionKey,
      )}.`,
    );
  }
  if (migrationOptions) {
    validateMigrationOptions(migrationOptions);
  }
}

function validateMigrationOptions(options: unknown): asserts options is MigrationOptions {
  assert.object(options, "'migrationOptions'", { allowArrays: false });
  const { resolveEmbeddedConstraints } = options;

  if (resolveEmbeddedConstraints !== undefined) {
    assert.boolean(resolveEmbeddedConstraints, "'resolveEmbeddedConstraints' on 'migrationOptions'");
  }
}
