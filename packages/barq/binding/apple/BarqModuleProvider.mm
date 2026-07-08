////////////////////////////////////////////////////////////////////////////
//
// Copyright 2016 Realm Inc.
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

#import <ReactCommon/CxxTurboModuleUtils.h>
#import <jsi/jsi.h>

#include <BarqJS/CxxBarqModule.hpp>

@interface BarqModule : NSObject
@end

@implementation BarqModule

+ (void)load {
  facebook::react::registerCxxModuleToGlobalModuleMap(
      barq::js::CxxBarqModule::kModuleName,
      [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
        return std::make_shared<barq::js::CxxBarqModule>(jsInvoker);
      });
}

@end
