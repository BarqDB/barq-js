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

/**
 * Local device metadata describing the current SDK/runtime. Barq does not send
 * this to a server (it is not part of the token-based sync protocol); it is kept
 * for platform diagnostics and to mirror the per-platform injection points.
 */
export type DeviceInfo = {
  sdk: string;
  sdkVersion: string;
  platform: string;
  platformVersion: string;
  deviceName: string;
  deviceVersion: string;
  cpuArch: string;
  frameworkName: string;
  frameworkVersion: string;
  bundleId: string;
};

type DeviceInfoType = {
  create(): DeviceInfo;
};

/** @internal */
export const deviceInfo: DeviceInfoType = {
  create() {
    throw new Error("Not supported on this platform");
  },
};

/** @internal */
export function inject(value: DeviceInfoType) {
  Object.freeze(Object.assign(deviceInfo, value));
}
