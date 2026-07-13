////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
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
//
// Modifications Copyright (c) 2026 the Barq authors
// Part of Barq (https://github.com/BarqDB/barq-js), a modified fork of Barq JS.
// Reshaped from Barq App-Services authentication into a simple provider for a
// Barq token-based sync user. Licensed under the Apache License, Version 2.0.
// See the top-level NOTICE file for fork attribution and trademark notices.
//
////////////////////////////////////////////////////////////////////////////

import React, { createContext, useContext } from "react";
import type { AnyUser } from "@barqdb/barq";

/**
 * React context holding the current Barq sync {@link AnyUser | user}, if any.
 * `BarqProvider` reads this to automatically attach the user to a sync
 * configuration.
 */
export const UserContext = createContext<AnyUser | null>(null);

type UserProviderProps = {
  /** The Barq sync user (created from a token via `Barq.User.fromToken`). */
  user: AnyUser | null;
  /** Rendered while `user` is `null`. */
  fallback?: React.ComponentType<unknown> | React.ReactElement | null | undefined;
  children: React.ReactNode;
};

/**
 * Makes a Barq token {@link AnyUser | user} available to the descendant
 * `BarqProvider` and to {@link useUser}. Unlike Barq, Barq performs
 * no login flow here — you obtain a signed token from your own identity provider,
 * build a user with `Barq.User.fromToken`, and pass it in.
 * @example
 * ```tsx
 * const user = Barq.User.fromToken(tenantId, userId, accessToken, { route: "https://sync.example.com" });
 * <UserProvider user={user}>
 *   <BarqProvider sync={{ flexible: true }}>
 *     <App />
 *   </BarqProvider>
 * </UserProvider>
 * ```
 */
export const UserProvider: React.FC<UserProviderProps> = ({ user, fallback: Fallback, children }) => {
  if (!user) {
    if (typeof Fallback === "function") {
      return <Fallback />;
    }
    return <>{Fallback}</>;
  }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
};

/**
 * Returns the current Barq sync {@link AnyUser | user} from the nearest
 * {@link UserProvider}.
 * @throws if no user has been set on the context.
 * @returns The current user.
 */
export const useUser = <T extends AnyUser = AnyUser>(): T => {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error("No user found. Did you forget to wrap your component in a <UserProvider>?");
  }
  return user as T;
};
