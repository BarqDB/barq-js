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

import assert from "node:assert";
import Barq, { Configuration } from "@barq/barq";
import { act } from "@testing-library/react-native";

import { randomBarqPath } from "./helpers";

export type BarqTestContext = {
  barq: Barq;
  useBarq: () => Barq;
  write(cb: () => void): void;
  openBarq(config?: Configuration): Barq;
  cleanup(): void;
};

/**
 * Opens a test barq at a randomized and temporary path.
 * @returns The `barq` and a `write` function, which will wrap `barq.write` with an `act` and prepand a second `barq.write` to force notifications to trigger synchronously.
 */
export function createBarqTestContext(rootConfig: Configuration = {}): BarqTestContext {
  let barq: Barq | null = null;
  const context = {
    get barq(): Barq {
      assert(barq, "Open the Barq first");
      return barq;
    },
    useBarq() {
      return context.barq;
    },
    openBarq(config: Configuration = {}) {
      if (barq) {
        // Close any barq, previously opened
        barq.close();
      }
      barq = new Barq({ ...rootConfig, ...config, path: randomBarqPath() });
      return barq;
    },
    write(callback: () => void) {
      act(() => {
        context.barq.write(callback);
        // Starting another write transaction will force notifications to fire synchronously
        context.barq.beginTransaction();
        context.barq.cancelTransaction();
      });
    },
    cleanup() {
      Barq.clearTestState();
    },
  };
  return context;
}
