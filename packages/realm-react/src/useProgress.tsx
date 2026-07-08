////////////////////////////////////////////////////////////////////////////
//
// Copyright 2023 Realm Inc.
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

import { EstimateProgressNotificationCallback, ProgressDirection, ProgressMode } from "@barq/barq";
import { useEffect, useState } from "react";
import { UseBarqHook } from "./useBarq";

type UserProgressHook = {
  direction: ProgressDirection;
  mode: ProgressMode;
};

export function createUseProgress(useBarq: UseBarqHook): ({ direction, mode }: UserProgressHook) => number | null {
  return function useProgress({ direction, mode }: UserProgressHook): number | null {
    const realm = useBarq();
    const [progress, setProgress] = useState<number | null>(null);

    useEffect(() => {
      if (!realm.syncSession) {
        throw new Error("No sync session found.");
      }
      const callback: EstimateProgressNotificationCallback = (estimate) => {
        setProgress(estimate);
      };

      realm.syncSession.addProgressNotification(direction, mode, callback);

      return () => realm.syncSession?.removeProgressNotification(callback);
    }, [realm, direction, mode]);

    return progress;
  };
}
