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

import { bytesEqual, bytesToHex, hexToBytes, randomBytes } from "./random";

const DASHED_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PLAIN_RE = /^[0-9a-fA-F]{32}$/;

function normalizeHex(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

/**
 * A 16-byte RFC-4122 universally unique identifier. Barq's own replacement value
 * type; API-compatible with the identifier the native engine stores.
 */
export class UUID {
  readonly id: Uint8Array;

  constructor(input?: string | Uint8Array | UUID) {
    if (input === undefined || input === null) {
      this.id = UUID.generate();
    } else if (typeof input === "string") {
      if (!DASHED_RE.test(input) && !PLAIN_RE.test(input)) {
        throw new Error(`Invalid UUID string: "${input}"`);
      }
      this.id = hexToBytes(normalizeHex(input));
    } else if (input instanceof UUID) {
      this.id = input.id.slice();
    } else if (input instanceof Uint8Array) {
      if (input.length !== 16) {
        throw new Error(`Invalid UUID byte length: ${input.length} (expected 16)`);
      }
      this.id = input.slice();
    } else {
      throw new Error("Invalid UUID argument");
    }
  }


  /** The raw 16 bytes. Provided as an alias of {@link UUID.id} for compatibility. */
  get buffer(): Uint8Array {
    return this.id;
  }

  /** Generate the raw 16 bytes for a version-4 UUID. */
  static generate(): Uint8Array {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    return bytes;
  }

  static isValid(input: unknown): boolean {
    if (input instanceof UUID) return true;
    if (input instanceof Uint8Array) return input.length === 16;
    if (typeof input === "string") return DASHED_RE.test(input) || PLAIN_RE.test(input);
    return false;
  }

  static createFromHexString(hex: string): UUID {
    return new UUID(hex);
  }

  toHexString(includeDashes = true): string {
    const hex = bytesToHex(this.id);
    if (!includeDashes) return hex;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  toString(): string {
    return this.toHexString(true);
  }

  toJSON(): string {
    return this.toHexString(true);
  }

  equals(other: unknown): boolean {
    if (other instanceof UUID) return bytesEqual(other.id, this.id);
    if (typeof other === "string") return UUID.isValid(other) && normalizeHex(other) === bytesToHex(this.id);
    return false;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `new UUID("${this.toHexString(true)}")`;
  }
}
