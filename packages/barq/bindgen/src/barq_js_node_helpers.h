#pragma once

#include <napi.h>
#include <barq_helpers.h>

#ifndef BARQ_DECAY_COPY
#define BARQ_DECAY_COPY(x) (::std::decay_t<decltype(x)>(x))
#endif

namespace barq::js::node {
namespace {

// TODO consider allowing Number (double) with (u)int64_t.
inline int64_t extractInt64FromNode(const Napi::Value& input)
{
    bool lossless;
    auto output = input.As<Napi::BigInt>().Int64Value(&lossless);
    if (!lossless)
        throw Napi::RangeError::New(input.Env(), "Value doesn't fit in int64_t");
    return output;
}
inline uint64_t extractUint64FromNode(const Napi::Value& input)
{
    bool lossless;
    auto output = input.As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless)
        throw Napi::RangeError::New(input.Env(), "Value doesn't fit in uint64_t");
    return output;
}

template <typename... Args>
inline Napi::Function bindFunc(Napi::Function func, Napi::Object self, Args... args)
{
    return func.Get("bind").As<Napi::Function>().Call(func, {self, args...}).template As<Napi::Function>();
}

BARQ_NOINLINE inline Napi::Object toNodeErrorCode(Napi::Env& env, const std::error_code& e) noexcept
{
    BARQ_ASSERT_RELEASE(e);
    auto out = Napi::Error::New(env, e.message()).Value();
    out.Set("code", e.value());
    out.Set("category", e.category().name());
    return out;
}

BARQ_NOINLINE inline Napi::Object toNodeException(Napi::Env& env, const std::exception_ptr& e) noexcept
{
    try {
        std::rethrow_exception(e);
    }
    catch (const Napi::Error& e) {
        return e.Value();
    }
    catch (const std::exception& e) {
        return Napi::Error::New(env, e.what()).Value();
    }
    catch (...) {
        return Napi::Error::New(env, "Unknown Error").Value();
    }
}

[[noreturn]] BARQ_NOINLINE inline void throwNodeException(Napi::Env& env, const std::exception& e)
{
    if (dynamic_cast<const Napi::Error*>(&e))
        throw; // Just allow exception propagation to continue
    // TODO consider throwing more specific errors in some cases.
    // TODO consider using ThrowAsJavaScriptException instead here.
    throw Napi::Error::New(env, e.what());
}

[[noreturn]] BARQ_NOINLINE inline void throwNullSharedPtrError(Napi::Env& env, const char* clsName)
{
    throw Napi::Error::New(env, util::format("Attempting to use an instanace of %1 holding a null shared_ptr. "
                                             "Did you call $resetSharedPtr on it already?",
                                             clsName));
}
} // namespace
} // namespace barq::js::node
