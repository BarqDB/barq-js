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

import { bytesEqual, bytesToHex, hexToBytes, isHexOfLength, randomBytes } from "./random";

// A 5-byte value that is stable for the lifetime of the process, plus a 3-byte
// counter seeded randomly — matching the standard 12-byte ObjectId layout of
// 4-byte timestamp + 5-byte process random + 3-byte counter.
const PROCESS_RANDOM = randomBytes(5);
let counter = randomBytes(3).reduce((acc, b) => (acc << 8) | b, 0) & 0xffffff;

function nextCounter(): number {
  counter = (counter + 1) & 0xffffff;
  return counter;
}

/**
 * A 12-byte, roughly-ordered unique identifier. Barq's own replacement value
 * type; API-compatible with the identifier the native engine stores.
 */
export class ObjectId {
  readonly id: Uint8Array;

  constructor(input?: string | number | Uint8Array | ObjectId) {
    if (input === undefined || input === null) {
      this.id = ObjectId.generate();
    } else if (typeof input === "number") {
      this.id = ObjectId.generate(input);
    } else if (typeof input === "string") {
      if (!isHexOfLength(input, 12)) {
        throw new Error(`Invalid ObjectId hex string: "${input}" (expected 24 hex characters)`);
      }
      this.id = hexToBytes(input);
    } else if (input instanceof ObjectId) {
      this.id = input.id.slice();
    } else if (input instanceof Uint8Array) {
      if (input.length !== 12) {
        throw new Error(`Invalid ObjectId byte length: ${input.length} (expected 12)`);
      }
      this.id = input.slice();
    } else {
      throw new Error("Invalid ObjectId argument");
    }
  }

  get _bsontype(): "ObjectId" {
    return "ObjectId";
  }

  /** Generate the raw 12 bytes for an ObjectId, optionally at a given time (seconds). */
  static generate(time?: number): Uint8Array {
    const seconds = typeof time === "number" ? Math.floor(time) : Math.floor(Date.now() / 1000);
    const bytes = new Uint8Array(12);
    bytes[0] = (seconds >> 24) & 0xff;
    bytes[1] = (seconds >> 16) & 0xff;
    bytes[2] = (seconds >> 8) & 0xff;
    bytes[3] = seconds & 0xff;
    bytes.set(PROCESS_RANDOM, 4);
    const c = nextCounter();
    bytes[9] = (c >> 16) & 0xff;
    bytes[10] = (c >> 8) & 0xff;
    bytes[11] = c & 0xff;
    return bytes;
  }

  static isValid(input: unknown): boolean {
    if (input instanceof ObjectId) return true;
    if (input instanceof Uint8Array) return input.length === 12;
    if (typeof input === "number") return true;
    if (typeof input === "string") return isHexOfLength(input, 12);
    return false;
  }

  static createFromHexString(hex: string): ObjectId {
    return new ObjectId(hex);
  }

  static createFromTime(seconds: number): ObjectId {
    const bytes = new Uint8Array(12);
    bytes[0] = (seconds >> 24) & 0xff;
    bytes[1] = (seconds >> 16) & 0xff;
    bytes[2] = (seconds >> 8) & 0xff;
    bytes[3] = seconds & 0xff;
    return new ObjectId(bytes);
  }

  toHexString(): string {
    return bytesToHex(this.id);
  }

  toString(): string {
    return this.toHexString();
  }

  toJSON(): string {
    return this.toHexString();
  }

  getTimestamp(): Date {
    const seconds = (this.id[0] << 24) | (this.id[1] << 16) | (this.id[2] << 8) | this.id[3];
    return new Date(seconds * 1000);
  }

  equals(other: unknown): boolean {
    if (other instanceof ObjectId) return bytesEqual(other.id, this.id);
    if (typeof other === "string") return ObjectId.isValid(other) && other.toLowerCase() === this.toHexString();
    if (other && typeof (other as { toHexString?: () => string }).toHexString === "function") {
      return (other as { toHexString: () => string }).toHexString().toLowerCase() === this.toHexString();
    }
    return false;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `new ObjectId("${this.toHexString()}")`;
  }
}
