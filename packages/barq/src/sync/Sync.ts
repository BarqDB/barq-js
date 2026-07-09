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

import { binding } from "../binding";
import { type LogLevel, type Logger, fromBindingLoggerLevelToNumericLogLevel, toBindingLoggerLevel } from "../Logger";
import type { Barq } from "../Barq";
import { SyncSession } from "./SyncSession";
import type { User } from "./User";
import {
  type OpenBarqBehaviorConfiguration,
  OpenBarqBehaviorType,
  OpenBarqTimeOutBehavior,
  type PartitionValue,
  pathForSyncConfig,
  validateSyncConfiguration,
} from "./SyncConfiguration";

export class Sync {
  /** @deprecated Will be removed in v13.0.0. Please use {@link Barq.setLogLevel}. */
  static setLogLevel(app: User, level: LogLevel) {
    // Barq exposes no per-user sync manager to the SDK; set the global log level
    // instead (equivalent to the recommended {@link Barq.setLogLevel}).
    binding.LogCategoryRef.getCategory("Barq").setDefaultLevelThreshold(toBindingLoggerLevel(level));
  }

  /** @deprecated Will be removed in v13.0.0. Please use {@link Barq.setLogger}. */
  static setLogger(app: User, logger: Logger) {
    // Route to the global default logger (equivalent to {@link Barq.setLogger}).
    binding.Logger.setDefaultLogger(
      binding.Helpers.makeLogger((_category, level, message) => {
        logger(fromBindingLoggerLevelToNumericLogLevel(level), message);
      }),
    );
  }
  /**
   * Get all sync sessions for a particular user.
   * @since 10.0.0
   */
  static getAllSyncSessions(user: User): SyncSession[] {
    return binding.JsTokenUser.getAllSessionsFor(user.internal).map((session) => new SyncSession(session));
  }
  /**
   * Get the session associated with a particular user and partition value.
   * @since 10.0.0
   */
  static getSyncSession(user: User, partitionValue: PartitionValue): SyncSession | null {
    validateSyncConfiguration({ user, partitionValue });
    const path = pathForSyncConfig(user, { partitionValue });
    const session = binding.JsTokenUser.getExistingActiveSession(user.internal, path);
    if (session) {
      return new SyncSession(session);
    } else {
      return null;
    }
  }
  // TODO: Consider breaking the API, turning this into a property

  /**
   * Set the application part of the User-Agent string that will be sent to the Barq Object Server when a session
   * is created.
   *
   * This method can only be called up to the point where the first Barq is opened. After that, the User-Agent
   * can no longer be changed.
   */
  static setUserAgent(app: User, userAgent: string) {
    binding.JsTokenUser.setUserAgent(app.internal, userAgent);
  }
  // TODO: Consider breaking the API, turning this into an instance method
  /**
   * Enable multiplexing multiple sync sessions over a single connection for a Barq app.
   * When having a lot of synchronized barqs open the system might run out of file
   * descriptors because of all the open sockets to the server. Session multiplexing
   * is designed to alleviate that, but it might not work with a server configured with
   * fail-over. Only use if you're seeing errors about reaching the file descriptor limit
   * and you know you are using many sync sessions.
   */
  static enableSessionMultiplexing(app: User) {
    binding.JsTokenUser.setSessionMultiplexing(app.internal, true);
  }

  // TODO: Consider breaking the API, turning this into an instance method
  /**
   * Initiate a client reset. The Barq must be closed prior to the reset.
   *
   * A synced Barq may need to be reset if the communications with the Barq sync Server
   * indicate an unrecoverable error that prevents continuing with normal synchronization. The
   * most common reason for this is if a client has been disconnected for too long.
   *
   * The local copy of the Barq is moved into a recovery directory
   * for safekeeping.
   *
   * Local writes that were not successfully synchronized to Barq
   * will be present in the local recovery copy of the Barq file. The re-downloaded Barq will
   * initially contain only the data present at the time the Barq was synchronized up on the server.
   * @deprecated
   * @throws An {@link Error} if reset is not possible.
   * @example
   * {
   *   // Once you have opened your Barq, you will have to keep a reference to it.
   *   // In the error handler, this reference is called `barq`
   *   const config = {
   *     // schema, etc.
   *     sync: {
   *       user,
   *       partitionValue,
   *       error: (session, error) => {
   *         if (error.name === 'ClientReset') {
   *           let path = barq.path; // barq.path will no be accessible after barq.close()
   *           barq.close();
   *           Barq.User.Sync.initiateClientReset(app, path);
   *           // - open Barq at `error.config.path` (oldBarq)
   *           // - open Barq with `config` (newBarq)
   *           // - copy required objects from oldBarq to newBarq
   *           // - close both Barqs
   *         }
   *       }
   *     }
   *   };
   * }
   */
  static initiateClientReset(app: User, path: string) {
    // barq-core does not expose the file-action API used for a manual client
    // reset. Recover by closing and deleting the local Barq file, then re-opening.
    throw new Error(`Client reset is not supported in Barq's token sync model (requested for Barq at: ${path}).`);
  }
  // TODO: Consider breaking the API, turning this into an instance method
  /**
   * Returns `true` if Barq still has a reference to any sync sessions regardless of their state.
   * If `false` is returned it means that no sessions currently exist.
   * @param [app] - The app where the Barq was opened.
   * @internal
   */
  static _hasExistingSessions(app: User) {
    return binding.JsTokenUser.hasExistingSessions(app.internal);
  }
  /**
   * @deprecated
   */
  static reconnect(app: User) {
    binding.JsTokenUser.reconnect(app.internal);
  }

  /**
   * The default behavior settings if you want to open a synchronized Barq immediately and start working on it.
   * If this is the first time you open the Barq, it will be empty while the server data is being downloaded in the background.
   * @deprecated since v12
   */

  static openLocalBarqBehavior: Readonly<OpenBarqBehaviorConfiguration> = {
    type: OpenBarqBehaviorType.OpenImmediately,
  };

  /**
   * The default behavior settings if you want to wait for downloading a synchronized Barq to complete before opening it.
   * @deprecated since v12
   */
  static downloadBeforeOpenBehavior: Readonly<OpenBarqBehaviorConfiguration> = {
    type: OpenBarqBehaviorType.DownloadBeforeOpen,
    timeOut: 30 * 1000,
    timeOutBehavior: OpenBarqTimeOutBehavior.ThrowException,
  };
}

// import * as internal from "../internal";
import * as SyncSessionNS from "./SyncSession";
import * as SyncConfigurationNS from "./SyncConfiguration";
import * as BaseSubscriptionSetNS from "./BaseSubscriptionSet";
import * as SubscriptionSetNS from "./SubscriptionSet";
import * as SubscriptionNS from "./Subscription";
import * as MutableSubscriptionSetNS from "./MutableSubscriptionSet";
import * as LogLevelNS from "../Logger";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Sync {
  export import ConnectionState = SyncSessionNS.ConnectionState;
  export import BaseSubscriptionSet = BaseSubscriptionSetNS.BaseSubscriptionSet;
  export import LogLevel = LogLevelNS.LogLevel;
  export import NumericLogLevel = LogLevelNS.NumericLogLevel;
  export import MutableSubscriptionSet = MutableSubscriptionSetNS.MutableSubscriptionSet;
  export import PartitionValue = SyncConfigurationNS.PartitionValue;
  export import SubscriptionOptions = MutableSubscriptionSetNS.SubscriptionOptions;
  export import SubscriptionSet = SubscriptionSetNS.SubscriptionSet;
  export import SubscriptionSetState = BaseSubscriptionSetNS.SubscriptionSetState;
  /** @deprecated Please use {@link BaseSubscriptionSetNS.SubscriptionSetState | SubscriptionSetState} */
  export import SubscriptionsState = BaseSubscriptionSetNS.SubscriptionSetState;
  export import Subscription = SubscriptionNS.Subscription;
  export import Session = SyncSessionNS.SyncSession;
}
