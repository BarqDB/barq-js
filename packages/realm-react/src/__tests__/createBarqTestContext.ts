////////////////////////////////////////////////////////////////////////////
//
// Copyright 2024 Realm Inc.
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
  realm: Barq;
  useBarq: () => Barq;
  write(cb: () => void): void;
  openBarq(config?: Configuration): Barq;
  cleanup(): void;
};

/**
 * Opens a test realm at a randomized and temporary path.
 * @returns The `realm` and a `write` function, which will wrap `realm.write` with an `act` and prepand a second `realm.write` to force notifications to trigger synchronously.
 */
export function createBarqTestContext(rootConfig: Configuration = {}): BarqTestContext {
  let realm: Barq | null = null;
  const context = {
    get realm(): Barq {
      assert(realm, "Open the Barq first");
      return realm;
    },
    useBarq() {
      return context.realm;
    },
    openBarq(config: Configuration = {}) {
      if (realm) {
        // Close any realm, previously opened
        realm.close();
      }
      realm = new Barq({ ...rootConfig, ...config, path: randomBarqPath() });
      return realm;
    },
    write(callback: () => void) {
      act(() => {
        context.realm.write(callback);
        // Starting another write transaction will force notifications to fire synchronously
        context.realm.beginTransaction();
        context.realm.cancelTransaction();
      });
    },
    cleanup() {
      Barq.clearTestState();
    },
  };
  return context;
}
