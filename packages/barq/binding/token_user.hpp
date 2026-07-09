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

#pragma once

#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#include <barq/object-store/sync/sync_manager.hpp>
#include <barq/object-store/sync/sync_session.hpp>
#include <barq/object-store/sync/sync_user.hpp>
#include <barq/object-store/sync/token_sync_user.hpp>

namespace barq {

// Bindgen shim exposing barq-core's token-based sync user to the JS SDK.
//
// The binding wraps users as a base `std::shared_ptr<SyncUser>`, but the token
// operations (tenant, route, token replacement, the owning SyncManager) live on
// the concrete `TokenSyncUser`. These static helpers downcast on the way in,
// exactly like the C API's `as_token_user()` in c_api/sync.cpp, so a single
// `SyncUser` binding class stays sufficient everywhere (SyncSession, SyncConfig)
// while the JS `User` gets its full token API. All calls map 1:1 to real
// TokenSyncUser / SyncManager methods, so this compiles against unmodified
// barq-core.
class JsTokenUser {
public:
    // --- construction -------------------------------------------------------

    // Barq performs no authentication: the caller supplies a signed access
    // token plus the tenant and user it is scoped to (validated server-side on
    // connect). Mirrors `barq_sync_user_new_from_token`.
    static std::shared_ptr<SyncUser> from_token(std::string tenant_id, std::string user_id, std::string access_token)
    {
        return TokenSyncUser::create(std::move(tenant_id), std::move(user_id), std::move(access_token));
    }

    // --- identity / token accessors ----------------------------------------

    static std::string tenant_id(const std::shared_ptr<SyncUser>& user)
    {
        return as_token(user)->tenant_id();
    }
    static std::string user_id(const std::shared_ptr<SyncUser>& user)
    {
        return user->user_id();
    }
    static std::string access_token(const std::shared_ptr<SyncUser>& user)
    {
        return user->access_token();
    }
    static std::string refresh_token(const std::shared_ptr<SyncUser>& user)
    {
        return user->refresh_token();
    }
    static SyncUser::State state(const std::shared_ptr<SyncUser>& user)
    {
        return user->state();
    }

    // --- token / route mutators --------------------------------------------

    static void set_route(const std::shared_ptr<SyncUser>& user, std::string route, bool verified)
    {
        as_token(user)->set_route(std::move(route), verified);
    }
    static void set_access_token(const std::shared_ptr<SyncUser>& user, std::string access_token)
    {
        as_token(user)->set_access_token(std::move(access_token));
    }
    static void mark_access_token_refresh_required(const std::shared_ptr<SyncUser>& user)
    {
        as_token(user)->mark_access_token_refresh_required();
    }
    static void log_out(const std::shared_ptr<SyncUser>& user)
    {
        as_token(user)->request_log_out();
    }

    // --- SyncManager operations (reached via the user) ----------------------

    static void set_user_agent(const std::shared_ptr<SyncUser>& user, std::string user_agent)
    {
        manager(user).set_user_agent(std::move(user_agent));
    }
    static void set_session_multiplexing(const std::shared_ptr<SyncUser>& user, bool allowed)
    {
        manager(user).set_session_multiplexing(allowed);
    }
    static void reconnect(const std::shared_ptr<SyncUser>& user)
    {
        manager(user).reconnect();
    }
    static bool has_existing_sessions(const std::shared_ptr<SyncUser>& user)
    {
        return manager(user).has_existing_sessions();
    }
    static std::vector<std::shared_ptr<SyncSession>> get_all_sessions_for(const std::shared_ptr<SyncUser>& user)
    {
        return manager(user).get_all_sessions_for(*user);
    }
    static std::shared_ptr<SyncSession> get_existing_active_session(const std::shared_ptr<SyncUser>& user,
                                                                    std::string path)
    {
        return manager(user).get_existing_active_session(path);
    }

private:
    static std::shared_ptr<TokenSyncUser> as_token(const std::shared_ptr<SyncUser>& user)
    {
        auto token = std::dynamic_pointer_cast<TokenSyncUser>(user);
        if (!token) {
            throw std::invalid_argument("User was not created from an access token");
        }
        return token;
    }

    static SyncManager& manager(const std::shared_ptr<SyncUser>& user)
    {
        auto* m = as_token(user)->sync_manager();
        if (!m) {
            throw std::runtime_error("Sync manager is not available for this user");
        }
        return *m;
    }
};

} // namespace barq
