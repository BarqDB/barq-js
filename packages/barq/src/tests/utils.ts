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

import path from "node:path";
import fs from "node:fs";

import type { Barq } from "../Barq";

export type BarqContext = Mocha.Context & { barq: Barq };

export function generateRandomInteger() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

export const BARQS_DIR = path.resolve(__dirname, "barqs");
export const BARQS_TEMP_DIR = path.resolve(BARQS_DIR, "temp");
if (!fs.existsSync(BARQS_TEMP_DIR)) {
  fs.mkdirSync(BARQS_TEMP_DIR, { recursive: true });
}

export function generateTempBarqPath() {
  return path.resolve(BARQS_TEMP_DIR, "random-" + generateRandomInteger() + ".barq");
}

export function closeBarq(this: Mocha.Context & Partial<BarqContext>) {
  if (this.barq && !this.barq.isClosed) {
    this.barq.close();
    delete this.barq;
  }
}
