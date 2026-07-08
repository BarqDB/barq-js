#include "CxxBarqModule.hpp"

#include "jsi_init.h"
#include "react_scheduler.h"

namespace barq::js {

CxxBarqModule::CxxBarqModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : facebook::react::TurboModule(CxxBarqModule::kModuleName, jsInvoker)
{

    methodMap_["initialize"] = MethodMetadata{1, &CxxBarqModule::initialize};
    // TODO: Create a ReactScheduler instead of storing the callInvoker
    callInvoker_ = std::move(jsInvoker);
    barq::js::react_scheduler::create_scheduler(callInvoker_);
}

CxxBarqModule::~CxxBarqModule()
{
    // Reset the scheduler to prevent invocations using an old runtime
    barq::js::react_scheduler::reset_scheduler();
#if DEBUG
    // Immediately close any open sync sessions to prevent race condition with new
    // JS thread when hot reloading
    barq_jsi_close_sync_sessions();
#endif
    barq_jsi_invalidate_caches();
}

facebook::jsi::Value CxxBarqModule::initialize(facebook::jsi::Runtime& rt, facebook::react::TurboModule& turboModule,
                                                const facebook::jsi::Value args[], size_t count)
{
    facebook::jsi::Object exports(rt);
    barq_jsi_init(rt, exports);
    return exports;
}

} // namespace barq::js