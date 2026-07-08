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

/* eslint-disable @typescript-eslint/no-unused-vars -- We're just testing types */

import { Barq as Barq2 } from "../src/index";

const barq = new Barq();
const barq2: Barq = new Barq();
const barq3 = new Barq2();
const app = new Barq.App("");
const app2 = new Barq2.App("");
const barq4: Barq2 = new Barq2();
declare const options: Barq2.App.Sync.SubscriptionOptions;
declare const options2: Barq.App.Sync.SubscriptionOptions;

// Calling statics is supported
Barq.deleteFile({});

// Mixing enums is supported
declare const state1: Barq.App.Sync.SubscriptionSetState;
const state2: Barq2.App.Sync.SubscriptionSetState = state1;
