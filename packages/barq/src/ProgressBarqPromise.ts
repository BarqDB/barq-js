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
import { TimeoutError } from "./errors";
import { flags } from "./flags";
import { indirect } from "./indirect";
import { type Configuration, validateConfiguration } from "./Configuration";
import { OpenBarqBehaviorType, OpenBarqTimeOutBehavior } from "./sync/SyncConfiguration";
import { SubscriptionSetState } from "./sync/BaseSubscriptionSet";
import { type ProgressNotificationCallback, isEstimateProgressNotificationCallback } from "./sync/SyncSession";
import { PromiseHandle } from "./PromiseHandle";
import { TimeoutPromise } from "./TimeoutPromise";
import type { Barq } from "./Barq";

type OpenBehavior = {
  openBehavior: OpenBarqBehaviorType;
  timeOut?: number;
  timeOutBehavior?: OpenBarqTimeOutBehavior;
};

function determineBehavior(config: Configuration, barqExists: boolean): OpenBehavior {
  const { sync, openSyncedBarqLocally } = config;
  if (!sync || openSyncedBarqLocally) {
    return { openBehavior: OpenBarqBehaviorType.OpenImmediately };
  } else {
    const configProperty = barqExists ? "existingBarqFileBehavior" : "newBarqFileBehavior";
    const configBehavior = sync[configProperty];
    if (configBehavior) {
      const { type, timeOut, timeOutBehavior } = configBehavior;
      if (typeof timeOut !== "undefined") {
        assert.number(timeOut, "timeOut");
      }
      return { openBehavior: type, timeOut, timeOutBehavior };
    } else {
      return {
        openBehavior: OpenBarqBehaviorType.DownloadBeforeOpen,
        timeOut: 30 * 1000,
        timeOutBehavior: OpenBarqTimeOutBehavior.ThrowException,
      };
    }
  }
}

export class ProgressBarqPromise implements Promise<Barq> {
  /** @internal */
  private static instances = new Set<binding.WeakRef<ProgressBarqPromise>>();
  /**
   * Cancels all unresolved `ProgressBarqPromise` instances.
   * @internal
   */
  public static cancelAll() {
    for (const promiseRef of ProgressBarqPromise.instances) {
      promiseRef.deref()?.cancel();
    }
    ProgressBarqPromise.instances.clear();
  }
  /** @internal */
  private task: binding.AsyncOpenTask | null = null;
  /** @internal */
  private listeners = new Set<ProgressNotificationCallback>();
  /** @internal */
  private handle = new PromiseHandle<Barq>();
  /** @internal */
  private timeoutPromise: TimeoutPromise<Barq> | null = null;
  /**
   * Token used for unregistering the progress notifier.
   * @internal
   */
  private notifierToken: binding.Int64 | null = null;

  /** @internal */
  constructor(config: Configuration) {
    if (flags.ALLOW_CLEAR_TEST_STATE) {
      ProgressBarqPromise.instances.add(new binding.WeakRef(this));
    }
    try {
      validateConfiguration(config);
      // Calling `Barq.exists()` before `binding.Barq.getSynchronizedBarq()` is necessary to capture
      // the correct value when this constructor was called since `binding.Barq.getSynchronizedBarq()`
      // will open the barq. This is needed when calling the Barq constructor.
      const barqExists = indirect.Barq.exists(config);
      const { openBehavior, timeOut, timeOutBehavior } = determineBehavior(config, barqExists);
      if (openBehavior === OpenBarqBehaviorType.OpenImmediately) {
        const barq = new indirect.Barq(config);
        this.handle.resolve(barq);
      } else if (openBehavior === OpenBarqBehaviorType.DownloadBeforeOpen) {
        const { bindingConfig } = indirect.Barq.transformConfig(config);

        // Construct an async open task
        this.task = binding.Barq.getSynchronizedBarq(bindingConfig);
        // If the promise handle gets rejected, we should cancel the open task
        // to avoid consuming a thread safe reference which is no longer registered
        this.handle.promise.catch(() => this.task?.cancel());

        this.createTimeoutPromise(config, { openBehavior, timeOut, timeOutBehavior });

        this.task
          .start()
          .then(async (tsr) => {
            const barq = new indirect.Barq(config, {
              internal: binding.Helpers.consumeThreadSafeReferenceToSharedBarq(tsr),
              // Do not call `Barq.exists()` here in case the barq has been opened by this point in time.
              barqExists,
            });
            if (config.sync?.flexible && !config.openSyncedBarqLocally) {
              const { subscriptions } = barq;
              if (subscriptions.state === SubscriptionSetState.Pending) {
                await subscriptions.waitForSynchronization();
              }
            }
            return barq;
          })
          .then(this.handle.resolve, (err) => {
            assert.undefined(err.code, "Update this to use the error code instead of matching on message");
            if (err instanceof Error && err.message === "Sync session became inactive") {
              // This can happen when two async tasks are opened for the same Barq and one gets canceled
              this.rejectAsCanceled();
            } else {
              this.handle.reject(err);
            }
          });
        this.notifierToken = this.task.registerDownloadProgressNotifier(this.emitProgress.bind(this));
      } else {
        throw new Error(`Unexpected open behavior '${openBehavior}'`);
      }
    } catch (err) {
      if (this.notifierToken !== null) {
        this.task?.unregisterDownloadProgressNotifier(this.notifierToken);
        this.notifierToken = null;
      }
      this.handle.reject(err);
    }
  }

  /**
   * Cancels the download of the Barq
   * If multiple `ProgressBarqPromise` instances are in progress for the same Barq, then canceling one of them
   * will cancel all of them.
   */
  cancel(): void {
    this.cancelAndResetTask();
    this.timeoutPromise?.cancel();
    if (this.notifierToken !== null) {
      this.task?.unregisterDownloadProgressNotifier(this.notifierToken);
      this.notifierToken = null;
    }
    // Clearing all listeners to avoid accidental progress notifications
    this.listeners.clear();
    // Tell anything awaiting the promise
    this.rejectAsCanceled();
  }

  /**
   * Register to receive progress notifications while the download is in progress.
   * @param callback Called multiple times as the client receives data.
   */
  progress(callback: ProgressNotificationCallback): this {
    this.listeners.add(callback);
    // TODO: Is the manual triggering necessary? It was meant to mimic the
    //       same behavior experienced prior to having the estimate notifier.
    if (isEstimateProgressNotificationCallback(callback)) {
      callback(1.0);
    } else {
      callback(0.0, 0.0);
    }
    return this;
  }

  then = this.handle.promise.then.bind(this.handle.promise);
  catch = this.handle.promise.catch.bind(this.handle.promise);
  finally = this.handle.promise.finally.bind(this.handle.promise);

  /** @internal */
  private emitProgress(transferredArg: binding.Int64, transferableArg: binding.Int64, progressEstimate: number) {
    const transferred = binding.Int64.intToNum(transferredArg);
    const transferable = binding.Int64.intToNum(transferableArg);
    for (const listener of this.listeners) {
      if (isEstimateProgressNotificationCallback(listener)) {
        listener(progressEstimate);
      } else {
        listener(transferred, transferable);
      }
    }
  }

  /** @internal */
  private createTimeoutPromise(config: Configuration, { timeOut, timeOutBehavior }: OpenBehavior) {
    if (typeof timeOut === "number") {
      this.timeoutPromise = new TimeoutPromise(
        this.handle.promise, // Ensures the timeout gets cancelled when the barq opens
        {
          ms: timeOut,
          message: `Barq could not be downloaded in the allocated time: ${timeOut} ms.`,
        },
      );
      if (timeOutBehavior === OpenBarqTimeOutBehavior.ThrowException) {
        // Make failing the timeout, reject the promise
        this.timeoutPromise.catch(this.handle.reject);
      } else if (timeOutBehavior === OpenBarqTimeOutBehavior.OpenLocalBarq) {
        // Make failing the timeout, resolve the promise
        this.timeoutPromise.catch((err) => {
          if (err instanceof TimeoutError) {
            this.cancelAndResetTask();
            const barq = new indirect.Barq(config);
            this.handle.resolve(barq);
          } else {
            this.handle.reject(err);
          }
        });
      } else {
        throw new Error(
          `Invalid 'timeOutBehavior': '${timeOutBehavior}'. Only 'throwException' and 'openLocalBarq' is allowed.`,
        );
      }
    }
  }

  /** @internal */
  private cancelAndResetTask() {
    if (this.task) {
      this.task.cancel();
      this.task.$resetSharedPtr();
      this.task = null;
    }
  }

  /** @internal */
  private rejectAsCanceled() {
    const err = new Error("Async open canceled");
    this.handle.reject(err);
  }

  get [Symbol.toStringTag]() {
    return ProgressBarqPromise.name;
  }
}
