////////////////////////////////////////////////////////////////////////////
//
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

// Barq's own value types. These replace the third-party BSON package entirely
// while remaining byte- and API-compatible with what the native engine stores,
// so schemas can keep using ObjectId, UUID, Decimal128 and Binary as before.

export { ObjectId } from "./ObjectId";
export { UUID } from "./UUID";
export { Binary } from "./Binary";
export { Decimal128 } from "./Decimal128";
export { EJSON } from "./EJSON";
export type { EJSONOptions } from "./EJSON";
