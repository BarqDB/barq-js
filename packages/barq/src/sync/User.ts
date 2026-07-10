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
// Part of Barq (https://github.com/BarqDB/barq-js), a modified fork of Realm JS.
// Reshaped from a Realm App user into Barq's token-based sync user
// (see barq-core `barq_sync_user_*` / `TokenSyncUser`). Licensed under the
// Apache License, Version 2.0. See the top-level NOTICE file for fork
// attribution and trademark notices.
//
////////////////////////////////////////////////////////////////////////////

import { binding } from "../binding";
import { assert } from "../assert";
import { injectIndirect } from "../indirect";

export type UserChangeCallback = () => void;

/**
 * The state of a {@link User}.
 */
export enum UserState {
  /** The user has a valid access token and can sync with a Barq server. */
  LoggedIn = "LoggedIn",
  /** The user's tokens have been cleared; ready to be given a new token. */
  LoggedOut = "LoggedOut",
  /** The user has been removed from the local store entirely. */
  Removed = "Removed",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyUser = User;

/**
 * Options accepted when constructing a Barq sync {@link User} from a token.
 */
export type UserTokenOptions = {
  /**
   * The Barq server endpoint (host or URL) this user syncs against. Equivalent
   * to barq-core `barq_sync_user_set_route`.
   */
  route?: string;
  /**
   * Whether {@link UserTokenOptions.route} has already been verified against the
   * server. Defaults to `true`.
   */
  routeVerified?: boolean;
};

/**
 * Representation of a synchronizing user of a Barq server.
 *
 * Unlike Barq, Barq does not perform authentication itself: your application
 * obtains a signed access token from your own identity provider and hands it to
 * Barq via {@link User.fromToken}, together with the tenant and user id the token
 * is scoped to. Barq validates the token's signature and claims on the server and
 * scopes all synced data to it.
 */
export class User {
  /** @internal */
  public readonly internal: binding.SyncUser;

  /**
   * @internal
   * JS-side change listeners. barq-core emits no user-change events, so these are
   * invoked by the SDK itself whenever it mutates the user (token/route/logout).
   */
  private readonly changeListeners = new Set<UserChangeCallback>();

  /**
   * Create a Barq sync user from a signed access token.
   *
   * The token is not inspected on the client beyond what your identity provider
   * embeds; it is validated by the Barq server on connect. Wraps barq-core
   * `barq_sync_user_new_from_token` / `TokenSyncUser::create`.
   * @param tenantId - The tenant (owner) the token is scoped to.
   * @param userId - The stable identifier of the user the token represents.
   * @param accessToken - A signed access token issued by your identity provider.
   * @param options - Optional route configuration.
   * @returns A {@link User} that can be passed to a sync configuration.
   */
  static fromToken(tenantId: string, userId: string, accessToken: string, options: UserTokenOptions = {}): User {
    assert.string(tenantId, "tenantId");
    assert(tenantId.length, "Please provide a non-empty tenant ID.");
    assert.string(userId, "userId");
    assert(userId.length, "Please provide a non-empty user ID.");
    assert.string(accessToken, "accessToken");
    assert(accessToken.length, "Please provide a non-empty access token.");
    const internal = binding.JsTokenUser.fromToken(tenantId, userId, accessToken);
    const user = new User(internal);
    if (options.route) {
      user.setRoute(options.route, options.routeVerified ?? true);
    }
    return user;
  }

  /** @internal */
  public static get(internal: binding.SyncUser): User {
    // TODO: Use a WeakRef to memoize the SDK object
    return new User(internal);
  }

  /** @internal */
  constructor(internal: binding.SyncUser) {
    this.internal = internal;

    Object.defineProperty(this, "changeListeners", {
      enumerable: false,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(this, "internal", {
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  /**
   * The tenant (owner) the user's token is scoped to, as validated by the server.
   * @returns The tenant ID as a string.
   */
  get tenantId(): string {
    return binding.JsTokenUser.tenantId(this.internal);
  }

  /**
   * The stable identifier of the user derived from its token.
   * @returns The user ID as a string.
   */
  get id(): string {
    return binding.JsTokenUser.userId(this.internal);
  }

  /**
   * The state of the user.
   * @returns The state as an enumerated string.
   */
  get state(): UserState {
    const state = binding.JsTokenUser.state(this.internal);
    switch (state) {
      case binding.SyncUserState.LoggedIn:
        return UserState.LoggedIn;
      case binding.SyncUserState.LoggedOut:
        return UserState.LoggedOut;
      case binding.SyncUserState.Removed:
        return UserState.Removed;
      default:
        throw new Error(`Unsupported SyncUserState value: ${state}`);
    }
  }

  /**
   * Whether the user currently holds a valid access token.
   * @returns `true` if the user is logged in, `false` otherwise.
   */
  get isLoggedIn(): boolean {
    return this.internal.isLoggedIn;
  }

  /**
   * The current access token used to authenticate sync requests.
   * @returns The access token as a string, or `null` if none is set.
   */
  get accessToken(): string | null {
    const token = binding.JsTokenUser.accessToken(this.internal);
    return token.length ? token : null;
  }

  /**
   * The refresh token, if one was supplied when the user was created.
   * @returns The refresh token as a string, or `null` if none is set.
   */
  get refreshToken(): string | null {
    const token = binding.JsTokenUser.refreshToken(this.internal);
    return token.length ? token : null;
  }

  /**
   * Point this user at a Barq server endpoint. Wraps barq-core
   * `barq_sync_user_set_route`.
   * @param route - The server host or URL to sync against.
   * @param verified - Whether the route is already known to be valid. Defaults to `true`.
   */
  setRoute(route: string, verified = true): void {
    assert.string(route, "route");
    binding.JsTokenUser.setRoute(this.internal, route, verified);
    this.emitChange();
  }

  /**
   * Replace the user's access token, e.g. after your identity provider issues a
   * fresh one. Wraps barq-core `barq_sync_user_set_access_token`.
   * @param accessToken - The new signed access token.
   */
  setAccessToken(accessToken: string): void {
    assert.string(accessToken, "accessToken");
    assert(accessToken.length, "Please provide a non-empty access token.");
    binding.JsTokenUser.setAccessToken(this.internal, accessToken);
    this.emitChange();
  }

  /**
   * Mark the current access token as needing a refresh, prompting the sync
   * client to request a new one before its next request. Wraps barq-core
   * `barq_sync_user_mark_access_token_refresh_required`.
   */
  markAccessTokenRefreshRequired(): void {
    binding.JsTokenUser.markAccessTokenRefreshRequired(this.internal);
    this.emitChange();
  }

  /**
   * Log the user out, clearing its tokens locally and stopping any active sync
   * sessions. The user can be reused by supplying a new token.
   * @returns A promise that resolves once the user has been logged out.
   */
  async logOut(): Promise<void> {
    binding.JsTokenUser.logOut(this.internal);
    this.emitChange();
  }

  /**
   * Adds a listener that will be fired on user related events, such as an access
   * or refresh token being replaced, or the user being logged out.
   * @param callback - The callback to be fired when the event occurs.
   */
  addListener(callback: UserChangeCallback): void {
    this.changeListeners.add(callback);
  }

  /**
   * Removes an event listener previously added via {@link User.addListener}.
   * @param callback - The callback to be removed.
   */
  removeListener(callback: UserChangeCallback): void {
    this.changeListeners.delete(callback);
  }

  /**
   * Removes all event listeners previously added via {@link User.addListener}.
   */
  removeAllListeners(): void {
    this.changeListeners.clear();
  }

  /** @internal Fire change listeners after an SDK-driven token/state change. */
  private emitChange(): void {
    for (const callback of this.changeListeners) {
      callback();
    }
  }
}

injectIndirect("User", User);
