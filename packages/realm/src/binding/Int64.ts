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

// A minimal signed 64-bit integer, Barq's own replacement for the third-party
// `Long` type used by the non-native BigInt polyfill. Backed by the platform's
// BigInt, wrapped so instances survive `instanceof` checks and expose the small
// method surface the binding relies on.

const TWO_POW_64 = 1n << 64n;
const SIGN_BIT = 1n << 63n;
const MASK_64 = TWO_POW_64 - 1n;

function wrapSigned(value: bigint): bigint {
  const masked = ((value % TWO_POW_64) + TWO_POW_64) % TWO_POW_64;
  return masked & SIGN_BIT ? masked - TWO_POW_64 : masked;
}

export class Long {
  /** The value, normalized to the signed 64-bit range. */
  readonly value: bigint;

  constructor(value: bigint | number | string = 0n) {
    this.value = wrapSigned(typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value)) || 0));
  }

  static fromNumber(value: number): Long {
    return new Long(BigInt(Math.trunc(value)));
  }

  static fromString(value: string): Long {
    return new Long(BigInt(value));
  }

  static fromBigInt(value: bigint): Long {
    return new Long(value);
  }

  add(other: Long | bigint | number): Long {
    const rhs = other instanceof Long ? other.value : BigInt(typeof other === "number" ? Math.trunc(other) : other);
    return new Long(this.value + rhs);
  }

  equals(other: Long | bigint | number | string): boolean {
    const rhs = other instanceof Long ? other.value : BigInt(typeof other === "number" ? Math.trunc(other) : other);
    return this.value === rhs;
  }

  toNumber(): number {
    return Number(this.value);
  }

  toBigInt(): bigint {
    return this.value;
  }

  /** The low 32 bits, matching the classic Long representation. */
  get low(): number {
    return Number((this.value & MASK_64) & 0xffffffffn) | 0;
  }

  /** The high 32 bits, matching the classic Long representation. */
  get high(): number {
    return Number(((this.value & MASK_64) >> 32n) & 0xffffffffn) | 0;
  }

  toString(radix?: number): string {
    return this.value.toString(radix);
  }

  toJSON(): string {
    return this.value.toString();
  }
}
