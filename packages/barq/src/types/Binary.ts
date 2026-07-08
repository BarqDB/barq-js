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

import { bytesEqual } from "./random";

function toBase64(bytes: Uint8Array): string {
  const g = globalThis as { btoa?: (s: string) => string; Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } };
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof g.btoa === "function") {
    return g.btoa(binary);
  }
  if (g.Buffer) {
    return g.Buffer.from(bytes).toString("base64");
  }
  // Minimal base64 fallback.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 63] : "=";
  }
  return out;
}

/**
 * A container for arbitrary binary data, tagged with a subtype byte. Barq's own
 * replacement for the equivalent value type; API-compatible so it round-trips
 * through the native binding unchanged.
 */
export class Binary {
  static readonly SUBTYPE_DEFAULT = 0;
  static readonly SUBTYPE_FUNCTION = 1;
  static readonly SUBTYPE_BYTE_ARRAY = 2;
  static readonly SUBTYPE_UUID_OLD = 3;
  static readonly SUBTYPE_UUID = 4;
  static readonly SUBTYPE_MD5 = 5;
  static readonly SUBTYPE_ENCRYPTED = 6;
  static readonly SUBTYPE_COLUMN = 7;
  static readonly SUBTYPE_USER_DEFINED = 128;

  readonly buffer: Uint8Array;
  readonly sub_type: number;

  constructor(buffer: Uint8Array = new Uint8Array(0), subType: number = Binary.SUBTYPE_DEFAULT) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.sub_type = subType;
  }


  length(): number {
    return this.buffer.length;
  }

  value(asRaw = false): Uint8Array {
    return asRaw ? this.buffer : this.buffer.slice();
  }

  equals(other: unknown): boolean {
    return other instanceof Binary && other.sub_type === this.sub_type && bytesEqual(other.buffer, this.buffer);
  }

  toString(): string {
    return toBase64(this.buffer);
  }

  toJSON(): string {
    return toBase64(this.buffer);
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `new Binary(<${this.buffer.length} bytes>, ${this.sub_type})`;
  }
}
