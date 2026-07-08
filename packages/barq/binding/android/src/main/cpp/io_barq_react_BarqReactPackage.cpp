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

#include <jni.h>
#include <fbjni/fbjni.h>
#include <ReactCommon/CxxTurboModuleUtils.h>
#include <android/log.h>
#include <android/asset_manager_jni.h>
#include <jsi/jsi.h>

#include "CxxBarqModule.hpp"
#include "jsi_init.h"
#include "react_scheduler.h"
#include "platform.hpp"
#include "jni_utils.hpp"

using namespace barq::jni_util;

jclass ssl_helper_class;

namespace barq {
// set the AssetManager used to access bundled files within the APK
void set_asset_manager(AAssetManager* assetManager);
} // namespace barq


JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*)
{
    JNIEnv* env;
    if (vm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        return JNI_ERR;
    }
    else {
        JniUtils::initialize(vm, JNI_VERSION_1_6);
    }

    // We do lookup the class in this Thread, since FindClass sometimes fails
    // when issued from the sync client thread
    ssl_helper_class = reinterpret_cast<jclass>(env->NewGlobalRef(env->FindClass("io/barq/react/util/SSLHelper")));

    facebook::react::registerCxxModuleToGlobalModuleMap(
        barq::js::CxxBarqModule::kModuleName, [](std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
            return std::make_shared<barq::js::CxxBarqModule>(jsInvoker);
        });

    return JNI_VERSION_1_6;
}

JNIEXPORT void JNI_OnUnload(JavaVM* vm, void*)
{
    JNIEnv* env;
    if (vm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        return;
    }
    else {
        env->DeleteLocalRef(ssl_helper_class);
        JniUtils::release();
    }
}

extern "C" JNIEXPORT void JNICALL Java_io_barq_react_BarqReactPackage_setDefaultBarqFileDirectoryImpl(
    JNIEnv* env, jobject thiz, jstring file_dir, jobject asset_manager)
{
    __android_log_print(ANDROID_LOG_VERBOSE, "Barq", "setDefaultBarqFileDirectory");

    // Get the assetManager in case we want to copy files from the APK (assets)
    AAssetManager* assetManager = AAssetManager_fromJava(env, asset_manager);
    if (assetManager == NULL) {
        __android_log_print(ANDROID_LOG_ERROR, "Barq", "Error loading the AssetManager");
    }
    barq::set_asset_manager(assetManager);

    // Setting the internal storage path for the application
    const char* file_dir_utf = env->GetStringUTFChars(file_dir, NULL);
    barq::JsPlatformHelpers::set_default_barq_file_directory(file_dir_utf);
    env->ReleaseStringUTFChars(file_dir, file_dir_utf);

    __android_log_print(ANDROID_LOG_DEBUG, "Barq", "Absolute path: %s",
                        barq::JsPlatformHelpers::default_barq_file_directory().c_str());
}
