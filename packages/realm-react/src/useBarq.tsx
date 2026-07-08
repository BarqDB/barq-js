////////////////////////////////////////////////////////////////////////////
//
// Copyright 2021 Realm Inc.
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

import Barq from "@barq/barq";
import { useContext } from "react";

export type UseBarqHook = {
  (): Barq;
};

/**
 * Generates a `useBarq` hook given a BarqContext.  This allows access to the {@link Barq}
 * instance anywhere within the BarqProvider.
 * @param BarqContext - The context containing the {@link Barq} instance
 * @returns useBarq - Hook that is used to gain access to the {@link Barq} instance
 */
export const createUseBarq = (BarqContext: React.Context<Barq | null>): UseBarqHook => {
  return function useBarq() {
    // This is the context setup by `createBarqContext`
    const context = useContext(BarqContext);
    if (context === null) {
      throw new Error("Barq context not found.  Did you call useBarq() within a <BarqProvider/>?");
    }
    return context;
  };
};
