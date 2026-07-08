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

import { act } from "@testing-library/react-native";
import { EstimateProgressNotificationCallback, ProgressBarqPromise, Barq } from "@barqdb/barq";
import { sleep } from "./helpers";

/**
 * Mocks {@link Barq.ProgressBarqPromise} with a custom
 * promise completion and progress handler.
 */
export class MockedProgressBarqPromise extends Promise<Barq> implements ProgressBarqPromise {
  private progressHandler?: (callback: EstimateProgressNotificationCallback) => void;
  private cancelHandler?: () => void;
  private barqPromise!: Promise<Barq>;

  constructor(
    getBarq: () => Promise<Barq>,
    options?: {
      progress?: (callback: EstimateProgressNotificationCallback) => void;
      cancel?: () => void;
    },
  ) {
    let barqPromise: Promise<Barq>;
    super((resolve) => {
      barqPromise = getBarq();
      barqPromise.then((barq) => resolve(barq));
    });
    // @ts-expect-error barqPromise value will be assigned right away
    this.barqPromise = barqPromise;
    this.progressHandler = options?.progress;
    this.cancelHandler = options?.cancel;
  }

  get [Symbol.toStringTag]() {
    return "MockedProgressBarqPromise";
  }

  cancel = () => {
    if (!this.cancelHandler) {
      throw new Error("cancel handler not set");
    }
    this.cancelHandler();
  };

  then<TResult1 = Barq, TResult2 = never>(
    onfulfilled?: ((value: Barq) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): Promise<TResult1 | TResult2> {
    return this.barqPromise.then(onfulfilled, onrejected);
  }

  progress = (callback: EstimateProgressNotificationCallback) => {
    if (!this.progressHandler) {
      throw new Error("progress handler not set");
    }
    this.progressHandler(callback);
    return this;
  };
}

/**
 * Mocked {@link ProgressBarqPromise} which resolves after a set delay.
 * If `options.progressValues` is specified, passes it through an
 * equal interval to `Barq.open(...).progress(...)` callback.
 */
export class MockedProgressBarqPromiseWithDelay extends MockedProgressBarqPromise {
  public currentProgressIndex = 0;
  public progressValues: number[] | undefined;
  private progressTimeout: NodeJS.Timeout | undefined;

  constructor(
    options: {
      delay?: number;
      /** Progress values which the `Barq.open(...).progress(...)` will receive in an equal interval. */
      progressValues?: number[];
    } = {},
  ) {
    const { progressValues, delay = 100 } = options;
    super(
      async () => {
        await sleep(delay);
        return new Barq();
      },
      {
        progress: (callback) => {
          this.progressTimeout = callMockedProgressNotifications(callback, delay, progressValues);
        },
        cancel: () => clearTimeout(this.progressTimeout),
      },
    );
    this.progressValues = progressValues;
  }
}

/** Calls given callbacks with progressValues in an equal interval */
export function callMockedProgressNotifications(
  callback: EstimateProgressNotificationCallback,
  timeFrame: number,
  progressValues: number[] = [0, 0.25, 0.5, 0.75, 1],
): NodeJS.Timeout {
  let progressIndex = 0;
  let progressInterval: NodeJS.Timeout | undefined = undefined;
  const sendProgress = () => {
    // Uses act as this causes a component state update.
    act(() => callback(progressValues[progressIndex]));
    progressIndex++;

    if (progressIndex >= progressValues.length) {
      // Send the next progress update in equidistant time
      clearInterval(progressInterval);
    }
  };
  progressInterval = setInterval(sendProgress, timeFrame / (progressValues.length + 1));
  sendProgress();
  return progressInterval;
}

/**
 * Mocks the Barq.open operation with a delayed, predictable Barq creation.
 * @returns Promise which resolves when the Barq is opened.
 */
export function mockBarqOpen(
  progressBarqPromise: MockedProgressBarqPromise = new MockedProgressBarqPromiseWithDelay(),
): MockedProgressBarqPromise {
  const delayedBarqOpen = jest.spyOn(Barq, "open");
  delayedBarqOpen.mockImplementation(() => progressBarqPromise);
  return progressBarqPromise;
}

/** Mocks a {@link Barq} with a custom syncSession and returns it. */
export function mockSyncedBarq({ syncSession }: { syncSession: Partial<Barq["syncSession"]> }) {
  const mockedSyncedBarq = new Barq();

  //@ts-expect-error The mock currently supports supplying a subset of methods
  jest.replaceProperty(mockedSyncedBarq, "syncSession", syncSession);

  return mockedSyncedBarq;
}
