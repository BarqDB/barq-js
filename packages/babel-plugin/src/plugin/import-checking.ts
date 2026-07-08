////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
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

import { types, NodePath } from "@babel/core";

// TODO: Merge the functions below into the functions above

export function isImportedFromBarq(path: NodePath<types.Node>): boolean {
  if (path.isMemberExpression()) {
    return isImportedFromBarq(path.get("object"));
  } else if (path.isTSQualifiedName()) {
    return isImportedFromBarq(path.get("left"));
  } else if (path.isDecorator() && types.isMemberExpression(path.get("expression").node)) {
    // Handle decorators with Barq namespace like `@Barq.index`
    return isImportedFromBarq(path.get("expression"));
  } else if (
    path.isDecorator() &&
    types.isCallExpression(path.get("expression").node) &&
    types.isMemberExpression(
      path
        .get("expression")
        .get("callee")
        .find(() => true)?.node,
    )
  ) {
    // Handle called decorators with Barq namespace like `@Barq.mapTo('xxx')`
    return isImportedFromBarq((path.get("expression") as NodePath<types.CallExpression>).get("callee"));
  } else if (path.isIdentifier() || path.isDecorator()) {
    const node = path.isDecorator()
      ? types.isCallExpression(path.node.expression)
        ? path.node.expression.callee
        : path.node.expression
      : path.node;
    if (!types.isIdentifier(node)) return false;

    const binding = path.scope.getBinding(node.name);

    if (binding && binding.path.parentPath && binding.path.parentPath.isImportDeclaration()) {
      return (
        binding.path.parentPath.get("source").isStringLiteral({ value: "@barq/barq" }) ||
        binding.path.parentPath.get("source").isStringLiteral({ value: "@barq/react" })
      );
    }
  }
  return false;
}

export function isPropertyImportedFromBarq(path: NodePath<types.Node>, name: string): boolean {
  if (path.isMemberExpression()) {
    return isImportedFromBarq(path.get("object")) && path.get("property").isIdentifier({ name });
  }
  return false;
}
