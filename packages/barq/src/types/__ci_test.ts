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

// Round-trip tests for the Barq value types. Run with `tsx` (see the Build
// workflow). Kept dependency-free so it runs without installing the workspace.

import { ObjectId, UUID, Binary, Decimal128, EJSON } from "./index";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("FAIL:", msg);
  }
}

// ObjectId
const oidHex = "0000002a9a7969d24bea4cf4";
const oid = new ObjectId(oidHex);
ok(oid.toHexString() === oidHex, "ObjectId hex round-trip");
ok(new ObjectId().id.length === 12, "ObjectId generate length 12");
ok(ObjectId.isValid(oidHex) && !ObjectId.isValid("xyz"), "ObjectId.isValid");
ok(oid.equals(new ObjectId(oidHex)), "ObjectId equals");
ok(oid._bsontype === "ObjectId", "ObjectId _bsontype");

// UUID
const u = new UUID("f81d4fae-7dec-11d0-a765-00a0c91e6bf6");
ok(u.toString() === "f81d4fae-7dec-11d0-a765-00a0c91e6bf6", "UUID dashed round-trip");
const u2 = new UUID();
ok(u2.id.length === 16 && (u2.id[6] & 0xf0) === 0x40, "UUID v4 version bits");
ok((u2.id[8] & 0xc0) === 0x80, "UUID variant bits");
ok(u.equals(new UUID("f81d4fae7dec11d0a76500a0c91e6bf6")), "UUID equals (no dashes)");

// Binary
const b = new Binary(new Uint8Array([1, 2, 3]), Binary.SUBTYPE_UUID);
ok(b.length() === 3 && b.sub_type === 4, "Binary length/subtype");

// Decimal128 round-trips
const decimals = [
  "0", "1", "-1", "123", "-123.456", "0.001", "1.5E+30", "-7.89E-10",
  "NaN", "Infinity", "-Infinity", "9999999999999999999999999999999999",
  "1E-6", "12345678901234567890", "10", "100.00",
];
for (const d of decimals) {
  const dec = new Decimal128(d);
  const back = dec.toString();
  ok(new Decimal128(back).toString() === back, `Decimal128 stable round-trip: ${d} -> ${back}`);
  ok(dec.bytes.length === 16, `Decimal128 16 bytes: ${d}`);
}
ok(new Decimal128("123").toString() === "123", "Decimal128 123");
ok(new Decimal128("-1").toString() === "-1", "Decimal128 -1");
ok(new Decimal128("NaN").toString() === "NaN", "Decimal128 NaN");
ok(new Decimal128("Infinity").toString() === "Infinity", "Decimal128 Infinity");
ok(Decimal128.isValid("3.14") && !Decimal128.isValid("abc"), "Decimal128.isValid");

// EJSON
const s = EJSON.stringify({ _id: oid, amount: new Decimal128("42.5") });
const parsed = EJSON.parse(s) as { _id: ObjectId; amount: Decimal128 };
ok(parsed._id instanceof ObjectId && parsed._id.equals(oid), "EJSON ObjectId round-trip");
ok(parsed.amount instanceof Decimal128 && parsed.amount.toString() === "42.5", "EJSON Decimal128 round-trip");

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
