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

import { Binary } from "./Binary";
import { Decimal128 } from "./Decimal128";
import { ObjectId } from "./ObjectId";
import { UUID } from "./UUID";

// A small, self-contained Extended-JSON codec covering the Barq value types.
// It is Barq's own implementation and carries no third-party dependency.

export type EJSONOptions = {
  /** Relaxed mode emits native numbers/dates where possible. Defaults to `true`. */
  relaxed?: boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  const g = globalThis as { btoa?: (s: string) => string; Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } };
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof g.btoa === "function") return g.btoa(binary);
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");
  return binary; // last-resort; environments without base64 are not expected
}

function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as { atob?: (s: string) => string; Buffer?: { from(s: string, enc: string): Uint8Array } };
  if (typeof g.atob === "function") {
    const binary = g.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (g.Buffer) return new Uint8Array(g.Buffer.from(b64, "base64"));
  return new Uint8Array(0);
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof ObjectId) return { $oid: value.toHexString() };
  if (value instanceof UUID) return { $uuid: value.toHexString(true) };
  if (value instanceof Decimal128) return { $numberDecimal: value.toString() };
  if (value instanceof Binary) return { $binary: { base64: bytesToBase64(value.buffer), subType: value.sub_type.toString(16).padStart(2, "0") } };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

function deserializeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deserializeValue);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    if (typeof obj.$oid === "string") return new ObjectId(obj.$oid);
    if (typeof obj.$uuid === "string") return new UUID(obj.$uuid);
    if (typeof obj.$numberDecimal === "string") return new Decimal128(obj.$numberDecimal);
    if (typeof obj.$date === "string") return new Date(obj.$date);
    if (obj.$binary && typeof obj.$binary === "object") {
      const bin = obj.$binary as { base64: string; subType?: string };
      return new Binary(base64ToBytes(bin.base64), bin.subType ? parseInt(bin.subType, 16) : 0);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = deserializeValue(v);
  return out;
}

/** Extended JSON codec for the Barq value types. */
export const EJSON = {
  serialize(value: unknown, _options?: EJSONOptions): Record<string, unknown> {
    return serializeValue(value) as Record<string, unknown>;
  },
  deserialize(doc: unknown, _options?: EJSONOptions): unknown {
    return deserializeValue(doc);
  },
  parse(text: string, _options?: EJSONOptions): unknown {
    return deserializeValue(JSON.parse(text));
  },
  stringify(
    value: unknown,
    replacer?: ((key: string, value: unknown) => unknown) | Array<string | number> | EJSONOptions,
    space?: string | number,
    _options?: EJSONOptions,
  ): string {
    const serialized = serializeValue(value);
    if (typeof replacer === "function") {
      return JSON.stringify(serialized, replacer as (key: string, value: unknown) => unknown, space);
    }
    if (Array.isArray(replacer)) {
      return JSON.stringify(serialized, replacer as Array<string | number>, space);
    }
    return JSON.stringify(serialized, undefined, space);
  },
};
