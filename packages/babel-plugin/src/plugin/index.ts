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

import { types, NodePath, PluginObj, PluginPass } from "@babel/core";

import { isPropertyImportedFromBarq, isImportedFromBarq } from "./import-checking";

type BarqType = {
  type: string;
  objectType?: string;
  default?: types.Expression;
  optional?: boolean;
  property?: string;
};

// This could be "int" or "double", but we default to "double" because this is how a JS Number is represented internally
const DEFAULT_NUMERIC_TYPE = "double";
const BARQ_NAMED_EXPORT = "Barq";
const TYPES_NAMED_EXPORT = "Types";

function isBarqTypeAlias(
  path: NodePath<types.TSEntityName | types.TSTypeReference>,
  name: string,
  namespace: string | null = TYPES_NAMED_EXPORT,
): boolean {
  if (path.isTSTypeReference()) {
    return isBarqTypeAlias(path.get("typeName"), name, namespace);
  } else if (path.isTSQualifiedName() && path.get("right").isIdentifier({ name })) {
    const left = path.get("left");
    if (namespace === null && left.isIdentifier({ name: BARQ_NAMED_EXPORT })) {
      // Barq.{{name}}
      return isImportedFromBarq(left);
    } else if (left.isIdentifier({ name: namespace })) {
      // {{namespace}}.{{name}}
      return isImportedFromBarq(left);
    } else if (path.get("left").isTSQualifiedName()) {
      // Barq.{{namespace}}.{{name}}
      return (
        left.isTSQualifiedName() &&
        left.get("left").isIdentifier({ name: BARQ_NAMED_EXPORT }) &&
        left.get("right").isIdentifier({ name: namespace }) &&
        isImportedFromBarq(path.get("left"))
      );
    }
  } else if (path.isIdentifier({ name })) {
    return isImportedFromBarq(path);
  }

  return false;
}

function getBarqTypeForTypeArgument(
  typeParameters: NodePath<types.TSTypeParameterInstantiation | null | undefined>,
): BarqType | undefined {
  if (typeParameters.isTSTypeParameterInstantiation()) {
    const objectTypePath = typeParameters.get("params")[0];
    return getBarqTypeForTSType(objectTypePath);
  }
}

function getLinkingObjectsError(message: string) {
  return message + '. Correct syntax is: `fieldName!: Barq.LinkingObjects<LinkedObjectType, "invertedPropertyName">`';
}

function getBarqTypeForTSTypeReference(path: NodePath<types.TSTypeReference>): BarqType | undefined {
  const typeName = path.get("typeName");
  const typeParameters = path.get("typeParameters");
  if (isBarqTypeAlias(path, "Bool")) {
    return { type: "bool" };
  } else if (isBarqTypeAlias(path, "String")) {
    return { type: "string" };
  } else if (isBarqTypeAlias(path, "Int")) {
    return { type: "int" };
  } else if (isBarqTypeAlias(path, "Float")) {
    return { type: "float" };
  } else if (isBarqTypeAlias(path, "Double")) {
    return { type: "double" };
  } else if (isBarqTypeAlias(path, "Decimal128")) {
    return { type: "decimal128" };
  } else if (isBarqTypeAlias(path, "ObjectId")) {
    return { type: "objectId" };
  } else if (isBarqTypeAlias(path, "UUID")) {
    return { type: "uuid" };
  } else if (isBarqTypeAlias(path, "Date") || typeName.isIdentifier({ name: "Date" })) {
    return { type: "date" };
  } else if (isBarqTypeAlias(path, "Data") || typeName.isIdentifier({ name: "ArrayBuffer" })) {
    return { type: "data" };
  } else if (isBarqTypeAlias(path, "List") || isBarqTypeAlias(path, "List", null)) {
    const argumentType = getBarqTypeForTypeArgument(typeParameters);
    const objectType = argumentType?.type === "object" ? argumentType.objectType : argumentType?.type;
    return { type: "list", objectType: objectType, optional: argumentType?.optional };
  } else if (isBarqTypeAlias(path, "Set") || isBarqTypeAlias(path, "Set", null)) {
    const argumentType = getBarqTypeForTypeArgument(typeParameters);
    const objectType = argumentType?.type === "object" ? argumentType.objectType : argumentType?.type;
    return { type: "set", objectType: objectType, optional: argumentType?.optional };
  } else if (isBarqTypeAlias(path, "Dictionary") || isBarqTypeAlias(path, "Dictionary", null)) {
    const argumentType = getBarqTypeForTypeArgument(typeParameters);
    const objectType = argumentType?.type === "object" ? argumentType.objectType : argumentType?.type;
    return { type: "dictionary", objectType: objectType, optional: argumentType?.optional };
  } else if (isBarqTypeAlias(path, "Mixed") || isBarqTypeAlias(path, "Mixed", null)) {
    return { type: "mixed" };
  } else if (isBarqTypeAlias(path, "LinkingObjects")) {
    const classPropertyNode = path.parentPath?.parentPath?.node;
    if (
      // Keep TS happy
      !types.isClassProperty(classPropertyNode) ||
      classPropertyNode.optional
    ) {
      throw path.buildCodeFrameError(getLinkingObjectsError("Properties of type LinkingObjects cannot be optional"));
    }

    if (!typeParameters.isTSTypeParameterInstantiation()) {
      throw path.buildCodeFrameError(getLinkingObjectsError("Missing type arguments for LinkingObjects"));
    }

    const params = typeParameters.get("params");

    if (params.length !== 2) {
      throw path.buildCodeFrameError(getLinkingObjectsError("Incorrect number of type arguments for LinkingObjects"));
    }

    const objectTypeNode = params[0];

    if (!objectTypeNode.isTSTypeReference() || !types.isIdentifier(objectTypeNode.node.typeName)) {
      throw path.buildCodeFrameError(
        getLinkingObjectsError(
          "First type argument for LinkingObjects should be a reference to the linked object's object type",
        ),
      );
    }

    const propertyNode = params[1];

    if (!propertyNode.isTSLiteralType() || !types.isStringLiteral(propertyNode.node.literal)) {
      throw path.buildCodeFrameError(
        getLinkingObjectsError(
          "Second type argument for LinkingObjects should be the property name of the relationship it inverts",
        ),
      );
    }

    const objectType = objectTypeNode.node.typeName.name;
    const property = propertyNode.node.literal.value;

    return { type: "linkingObjects", objectType, property };
  } else if (typeName.isIdentifier()) {
    // TODO: Consider checking the scope to ensure it is a declared identifier
    return { type: "object", objectType: typeName.node.name };
  }
}

function getBarqTypeForTSType(path: NodePath<types.TSType>): BarqType | undefined {
  if (path.isTSBooleanKeyword()) {
    return { type: "bool" };
  } else if (path.isTSStringKeyword()) {
    return { type: "string" };
  } else if (path.isTSNumberKeyword()) {
    return { type: DEFAULT_NUMERIC_TYPE };
  } else if (path.isTSTypeReference()) {
    return getBarqTypeForTSTypeReference(path);
  } else if (path.isTSUnionType()) {
    const types = path.get("types");
    if (types.length === 2) {
      const [first, last] = types;
      if (first.isTSUndefinedKeyword()) {
        const type = getBarqTypeForTSType(last);
        return type ? { ...type, optional: true } : undefined;
      } else if (last.isTSUndefinedKeyword()) {
        const type = getBarqTypeForTSType(first);
        return type ? { ...type, optional: true } : undefined;
      }
    }
  }
}

function inferTypeFromInitializer(path: NodePath<types.Expression>): BarqType | undefined {
  if (path.isBooleanLiteral()) {
    return { type: "bool" };
  } else if (path.isStringLiteral()) {
    return { type: "string" };
  } else if (path.isNumericLiteral()) {
    return { type: DEFAULT_NUMERIC_TYPE };
  } else if (path.isNewExpression()) {
    if (isPropertyImportedFromBarq(path.get("callee"), "Decimal128")) {
      return { type: "decimal128" };
    } else if (isPropertyImportedFromBarq(path.get("callee"), "ObjectId")) {
      return { type: "objectId" };
    } else if (isPropertyImportedFromBarq(path.get("callee"), "UUID")) {
      return { type: "uuid" };
    } else if (
      isPropertyImportedFromBarq(path.get("callee"), "Date") ||
      path.get("callee").isIdentifier({ name: "Date" })
    ) {
      return { type: "date" };
    } else if (
      isPropertyImportedFromBarq(path.get("callee"), "Data") ||
      path.get("callee").isIdentifier({ name: "ArrayBuffer" })
    ) {
      return { type: "data" };
    }
  }
}

function getBarqTypeForClassProperty(path: NodePath<types.ClassProperty>): BarqType | undefined {
  const typeAnnotationPath = path.get("typeAnnotation");
  const valuePath = path.get("value");
  if (typeAnnotationPath.isTSTypeAnnotation()) {
    const typePath = typeAnnotationPath.get("typeAnnotation");
    return getBarqTypeForTSType(typePath);
  } else if (valuePath.isExpression()) {
    return inferTypeFromInitializer(valuePath);
  }
}

function isBarqDecoratorWithName(path: any, name: string): boolean {
  return (
    (types.isIdentifier(path) && path.name === name) ||
    (types.isMemberExpression(path) &&
      types.isIdentifier(path.object) &&
      path.object.name === "Barq" &&
      types.isIdentifier(path.property) &&
      path.property.name === name)
  );
}

function findDecoratorIdentifier(
  decoratorsPath: NodePath<types.Decorator>[],
  name: string,
): NodePath<types.Decorator> | undefined {
  return decoratorsPath.find(
    (d) =>
      d.node &&
      isBarqDecoratorWithName(d.node.expression, name) &&
      // ((types.isIdentifier(d.node.expression) && d.node.expression.name === name) ||
      //   (types.isMemberExpression(d.node.expression) &&
      //     types.isIdentifier(d.node.expression.object) &&
      //     d.node.expression.object.name === "Barq" &&
      //     types.isIdentifier(d.node.expression.property) &&
      //     d.node.expression.property.name === name)) &&
      isImportedFromBarq(d),
  );
}

function findDecoratorCall(
  decoratorsPath: NodePath<types.Decorator>[],
  name: string,
): { decoratorNode: NodePath<types.Decorator>; callExpression: types.CallExpression } | undefined {
  const node = decoratorsPath.find(
    (d) =>
      d.node &&
      types.isCallExpression(d.node.expression) &&
      isBarqDecoratorWithName(d.node.expression.callee, name) &&
      // types.isIdentifier(d.node.expression.callee) &&
      // d.node.expression.callee.name === name &&
      isImportedFromBarq(d),
  );

  if (!node) return undefined;

  // Return both the node and the callExpression from here to avoid
  // additional type checking requirements at the call site
  return { decoratorNode: node, callExpression: node.node.expression as types.CallExpression };
}

function visitBarqClassProperty(path: NodePath<types.ClassProperty>) {
  const keyPath = path.get("key");
  const valuePath = path.get("value");
  // TODO: Avoid this type assertion
  const decoratorsPath = path.get("decorators") as NodePath<types.Decorator>[];

  const indexDecorator = findDecoratorIdentifier(decoratorsPath, "index");
  if (indexDecorator) {
    indexDecorator;
  }
  const index = Boolean(indexDecorator);

  const indexDecoratorCall = findDecoratorCall(decoratorsPath, "index");
  const indexCall =
    indexDecoratorCall && types.isStringLiteral(indexDecoratorCall.callExpression.arguments[0])
      ? indexDecoratorCall.callExpression.arguments[0].value
      : undefined;

  const mapToDecorator = findDecoratorCall(decoratorsPath, "mapTo");
  const mapTo =
    mapToDecorator && types.isStringLiteral(mapToDecorator.callExpression.arguments[0])
      ? mapToDecorator.callExpression.arguments[0].value
      : undefined;

  // Remove the decorators from the final source as they are only for schema annotation purposes.
  // Decorator implementations will throw to prevent usage outside of the plugin.
  if (indexDecorator) indexDecorator.remove();
  if (indexDecoratorCall) indexDecoratorCall.decoratorNode.remove();
  if (mapToDecorator) mapToDecorator.decoratorNode.remove();

  if (keyPath.isIdentifier()) {
    const name = keyPath.node.name;
    const barqType = getBarqTypeForClassProperty(path);
    if (barqType) {
      const properties: types.ObjectProperty[] = [
        types.objectProperty(types.identifier("type"), types.stringLiteral(barqType.type)),
      ];

      if (path.node.optional || barqType.optional) {
        properties.push(types.objectProperty(types.identifier("optional"), types.booleanLiteral(true)));
      }

      if (barqType.objectType) {
        properties.push(
          types.objectProperty(types.identifier("objectType"), types.stringLiteral(barqType.objectType)),
        );
      }

      if (barqType.property) {
        properties.push(types.objectProperty(types.identifier("property"), types.stringLiteral(barqType.property)));
      }

      if (valuePath.isLiteral()) {
        properties.push(types.objectProperty(types.identifier("default"), valuePath.node));
      } else if (valuePath.isExpression()) {
        properties.push(
          types.objectProperty(types.identifier("default"), types.arrowFunctionExpression([], valuePath.node)),
        );
        valuePath.remove();
      }

      if (index) {
        properties.push(types.objectProperty(types.identifier("indexed"), types.booleanLiteral(true)));
      }

      if (indexCall) {
        properties.push(types.objectProperty(types.identifier("indexed"), types.stringLiteral(indexCall)));
      }

      if (mapTo) {
        properties.push(types.objectProperty(types.identifier("mapTo"), types.stringLiteral(mapTo)));
      }

      return types.objectProperty(types.identifier(name), types.objectExpression(properties));
    } else {
      console.warn(`Unable to determine type of '${name}' property`);
    }
  }
}

const STATIC_STRING_PROPERTIES: string[] = ["name", "primaryKey"];
const STATIC_BOOLEAN_PROPERTIES: string[] = ["embedded", "asymmetric"];

function visitBarqClassStatic(path: NodePath<types.ClassProperty>) {
  const keyPath = path.get("key");
  const valuePath = path.get("value");

  if (keyPath.isIdentifier()) {
    const name = keyPath.node.name;

    if (STATIC_STRING_PROPERTIES.includes(name) && types.isStringLiteral(valuePath.node)) {
      return types.objectProperty(types.identifier(name), types.stringLiteral(valuePath.node.value));
    } else if (STATIC_BOOLEAN_PROPERTIES.includes(name) && types.isBooleanLiteral(valuePath.node)) {
      return types.objectProperty(types.identifier(name), types.booleanLiteral(valuePath.node.value));
    }
  }
}

function visitBarqClass(path: NodePath<types.ClassDeclaration>) {
  path.addComment("leading", " Modified by @barqdb/babel-plugin", true);
  const classIdentifier = path.node.id;
  if (!classIdentifier) {
    throw new Error("Classes extending Barq.Object are expected to have a name");
  }
  const className = classIdentifier.name;
  // Transform properties to a static schema object
  const classProperties = path
    .get("body")
    .get("body")
    .filter((p) => p.isClassProperty()) as NodePath<types.ClassProperty>[];

  if (classProperties.find((p) => p.node.static && types.isIdentifier(p.node.key) && p.node.key.name === "schema")) {
    throw new Error(
      "Classes extending Barq.Object cannot define their own `schema` static, all properties must be defined using TypeScript syntax",
    );
  }

  const schemaProperties = classProperties
    .filter((p) => !p.node.static)
    .map(visitBarqClassProperty)
    .filter((property) => property) as types.ObjectProperty[];

  const schemaStatics = classProperties
    .filter((p) => p.node.static)
    .map(visitBarqClassStatic)
    .filter((property) => property) as types.ObjectProperty[];

  const schema = types.objectExpression([
    types.objectProperty(types.identifier("name"), types.stringLiteral(className)),
    types.objectProperty(types.identifier("properties"), types.objectExpression(schemaProperties)),
    ...schemaStatics,
  ]);

  // Add the schema as a static
  const schemaStatic = types.classProperty(types.identifier("schema"), schema, undefined, undefined, undefined, true);
  path.get("body").pushContainer("body", schemaStatic);
}

/**
 * @param path The path of a class which might extend Barq's `Object`
 * @returns True iff the `path` points to a class which extends the `Object` which binds to an `Object` imported from the `"barq"` package.
 */
function isClassExtendingBarqObject(path: NodePath<types.ClassDeclaration>) {
  // Determine if the super class is the "Object" class from the "barq" package
  const superClass = path.get("superClass");
  if (path.isClassDeclaration() && superClass.isExpression() && isPropertyImportedFromBarq(superClass, "Object")) {
    // The class is extending "Barq.Object" from "@barqdb/barq"
    return true;
  } else if (superClass.isIdentifier({ name: "Object" }) && isImportedFromBarq(superClass)) {
    // The class is extending "Object" from "@barqdb/barq"
    return true;
  }
  return false;
}

// Thanks to https://twitter.com/NicoloRibaudo/status/1572482164230348800
function isTypescriptFile(filename: string | undefined) {
  if (!filename) return false;

  const extension = filename.split(".").pop();
  return extension && ["ts", "cts", "mts", "tsx"].includes(extension);
}

export default function (): PluginObj<PluginPass> {
  return {
    visitor: {
      ClassDeclaration(path) {
        if (isClassExtendingBarqObject(path)) {
          if (!isTypescriptFile(this.filename)) {
            console.warn(
              `@barqdb/babel-plugin can only be used with Typescript source files. Ignoring ${this.filename}`,
            );
          } else {
            visitBarqClass(path);
          }
        }
      },
    },
  };
}
