////////////////////////////////////////////////////////////////////////////
//
// Copyright 2023 Realm Inc.
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
 * Decorators are not intended to be used at runtime and are removed from the source
 * by @barqdb/babel-plugin. Therefore, if a decorator is called, this means it is being
 * used outside of @barqdb/babel-plugin (or the plugin is incorrectly configured), so
 * we should throw
 */
class DecoratorError extends Error {
  constructor(name: string) {
    super(
      `The @${name} decorator cannot be used without the \`@barqdb/babel-plugin\` Babel plugin. Please check that you have installed and configured the Babel plugin.`,
    );
  }
}

export type IndexDecorator = (target: unknown, memberName: string) => void;

/**
 * Specify that the decorated field should be indexed by Barq.
 * See: [documentation](https://github.com/BarqDB/barq-js)
 */
export const index: IndexDecorator = () => {
  throw new DecoratorError("index");
};

export type MapToDecorator = (propertyName: string) => (target: unknown, memberName: string) => void;

/**
 * Specify that the decorated field should be remapped to a different property name in the Barq database.
 * See: [documentation](https://github.com/BarqDB/barq-js)
 * @param propertyName The name of the property in the Barq database
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- We don't read this at runtime */
export const mapTo: MapToDecorator = (propertyName: string) => {
  throw new DecoratorError("mapTo");
};
