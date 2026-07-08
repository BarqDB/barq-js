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

// A 128-bit decimal floating-point value (IEEE 754-2008 decimal128) using the
// BID (Binary Integer Decimal) interchange encoding, stored as 16 little-endian
// bytes. This is Barq's own implementation — it replaces the third-party value-type
// codec while remaining byte-compatible with what the native engine stores.
//
// Layout (finite, "small significand" form, which covers every value with <= 34
// significant digits — i.e. all valid decimal128 numbers):
//   bit 127        : sign
//   bits 126..113  : biased exponent (14 bits, bias 6176)
//   bits 112..0    : unsigned coefficient (< 10^34 < 2^113)
// Specials use the combination field: 0x78.. = Infinity, 0x7c.. = NaN.

const EXPONENT_BIAS = 6176;
const EXPONENT_MAX = 6111; // unbiased
const EXPONENT_MIN = -6176; // unbiased
const MAX_DIGITS = 34;
const MASK_64 = (1n << 64n) - 1n;

const PARSE_RE = /^([+-])?(\d+)?(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

function isSpecial(value: string): "NaN" | "Infinity" | "-Infinity" | undefined {
  const v = value.trim();
  if (/^(nan)$/i.test(v)) return "NaN";
  if (/^[+]?(inf|infinity)$/i.test(v)) return "Infinity";
  if (/^-(inf|infinity)$/i.test(v)) return "-Infinity";
  return undefined;
}

function bytesFromHalves(low: bigint, high: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  let lo = low & MASK_64;
  let hi = high & MASK_64;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(lo & 0xffn);
    lo >>= 8n;
  }
  for (let i = 0; i < 8; i++) {
    bytes[8 + i] = Number(hi & 0xffn);
    hi >>= 8n;
  }
  return bytes;
}

function halvesFromBytes(bytes: Uint8Array): { low: bigint; high: bigint } {
  let low = 0n;
  let high = 0n;
  for (let i = 7; i >= 0; i--) {
    low = (low << 8n) | BigInt(bytes[i]);
  }
  for (let i = 7; i >= 0; i--) {
    high = (high << 8n) | BigInt(bytes[8 + i]);
  }
  return { low, high };
}

/**
 * A 128-bit decimal value. Barq's own replacement for the equivalent third-party
 * value type; byte-compatible with the native engine's decimal column type.
 */
export class Decimal128 {
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array | string) {
    if (typeof bytes === "string") {
      this.bytes = Decimal128.fromString(bytes).bytes;
    } else if (bytes instanceof Uint8Array) {
      if (bytes.length !== 16) {
        throw new Error(`Invalid Decimal128 byte length: ${bytes.length} (expected 16)`);
      }
      this.bytes = bytes.slice();
    } else {
      throw new Error("Invalid Decimal128 argument");
    }
  }


  static isValid(value: string): boolean {
    try {
      Decimal128.fromString(value);
      return true;
    } catch {
      return false;
    }
  }

  static fromString(representation: string): Decimal128 {
    const special = isSpecial(representation);
    if (special === "NaN") return new Decimal128(bytesFromHalves(0n, 0x7c00000000000000n));
    if (special === "Infinity") return new Decimal128(bytesFromHalves(0n, 0x7800000000000000n));
    if (special === "-Infinity") return new Decimal128(bytesFromHalves(0n, 0xf800000000000000n));

    const match = PARSE_RE.exec(representation.trim());
    if (!match || (match[2] === undefined && match[3] === undefined)) {
      throw new Error(`Invalid Decimal128 string: "${representation}"`);
    }
    const sign = match[1] === "-" ? 1n : 0n;
    const intPart = match[2] ?? "";
    const fracPart = match[3] ?? "";
    const explicitExp = match[4] ? parseInt(match[4], 10) : 0;

    let digits = (intPart + fracPart).replace(/^0+(?=\d)/, "");
    let exponent = explicitExp - fracPart.length;

    // Remove trailing zeros while it keeps the exponent within range (this is the
    // canonical cohort member preference and keeps the coefficient small).
    // Drop leading zeros already handled; ensure at least one digit.
    if (digits.length === 0) digits = "0";

    // Round to at most 34 significant digits (round half-up on the dropped tail).
    if (digits.length > MAX_DIGITS) {
      const keep = digits.slice(0, MAX_DIGITS);
      const roundDigit = digits.charCodeAt(MAX_DIGITS) - 48;
      const dropped = digits.length - MAX_DIGITS;
      exponent += dropped;
      let coeff = BigInt(keep);
      if (roundDigit >= 5) coeff += 1n;
      digits = coeff.toString();
      // Rounding may have produced a 35th digit (e.g. 999..9 -> 1000..0).
      if (digits.length > MAX_DIGITS) {
        digits = digits.slice(0, MAX_DIGITS);
        exponent += 1;
      }
    }

    // Clamp exponent into the representable range by shifting the point where
    // possible (append zeros to grow the exponent down; the value is preserved).
    while (exponent > EXPONENT_MAX && digits.length < MAX_DIGITS) {
      digits += "0";
      exponent -= 1;
    }
    while (exponent < EXPONENT_MIN && digits.length > 1 && digits.endsWith("0")) {
      digits = digits.slice(0, -1);
      exponent += 1;
    }
    if (exponent > EXPONENT_MAX || exponent < EXPONENT_MIN) {
      throw new Error(`Decimal128 exponent out of range for "${representation}"`);
    }

    const coefficient = BigInt(digits);
    if (coefficient >= 1n << 113n) {
      throw new Error(`Decimal128 coefficient too large for "${representation}"`);
    }

    const biasedExponent = BigInt(exponent + EXPONENT_BIAS);
    const low = coefficient & MASK_64;
    const significandHigh = (coefficient >> 64n) & ((1n << 49n) - 1n);
    const high = (sign << 63n) | (biasedExponent << 49n) | significandHigh;
    return new Decimal128(bytesFromHalves(low, high));
  }

  toString(): string {
    const { low, high } = halvesFromBytes(this.bytes);
    const sign = (high >> 63n) & 1n ? "-" : "";

    // Special values live in the top combination bits.
    if ((high & 0x7c00000000000000n) === 0x7c00000000000000n) return "NaN";
    if ((high & 0x7800000000000000n) === 0x7800000000000000n) return `${sign}Infinity`;

    const biasedExponent = (high >> 49n) & 0x3fffn;
    const exponent = Number(biasedExponent) - EXPONENT_BIAS;
    const significandHigh = high & ((1n << 49n) - 1n);
    const coefficient = (significandHigh << 64n) | low;

    const digits = coefficient.toString();
    const adjustedExponent = exponent + (digits.length - 1);

    // Formatting rules per IEEE 754-2008 / the canonical decimal string form.
    if (exponent <= 0 && adjustedExponent >= -6) {
      if (exponent === 0) {
        return sign + digits;
      }
      const pointPos = digits.length + exponent;
      if (pointPos <= 0) {
        return sign + "0." + "0".repeat(-pointPos) + digits;
      }
      return sign + digits.slice(0, pointPos) + "." + digits.slice(pointPos);
    }

    // Scientific notation.
    const mantissa = digits.length > 1 ? digits[0] + "." + digits.slice(1) : digits;
    const expSign = adjustedExponent >= 0 ? "+" : "-";
    return `${sign}${mantissa}E${expSign}${Math.abs(adjustedExponent)}`;
  }

  toJSON(): string {
    return this.toString();
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Decimal128)) return false;
    for (let i = 0; i < 16; i++) {
      if (other.bytes[i] !== this.bytes[i]) return false;
    }
    return true;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `new Decimal128("${this.toString()}")`;
  }
}
