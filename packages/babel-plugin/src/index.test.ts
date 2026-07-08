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

import * as babel from "@babel/core";

import type { ObjectSchema, PropertySchema } from "@barq/barq";

import { describeProperty, extractSchema } from "./tests/generator";
import { transformProperty } from "./tests/generator/transform";
import { transform, TransformOptions } from "./tests/transform";

type TransformTestOptions = { name: string; test: (result: babel.BabelFileResult) => void } & TransformOptions;

function itTransforms({ name, test, ...options }: TransformTestOptions) {
  it(name, () => {
    const result = transform(options);
    test(result);
  });
}

function itTransformsSchema(name: string, source: string, test: (schema: ObjectSchema | undefined) => void) {
  itTransforms({
    name,
    source,
    test(result) {
      const schema = extractSchema(result);
      test(schema);
    },
  });
}

describe("Babel plugin", () => {
  describe("class transformation", () => {
    itTransformsSchema(
      "doesn't transform when Barq.Object is unresolved",
      "class Person extends Barq.Object {}",
      (schema) => {
        expect(schema).toBe(undefined);
      },
    );

    describe("importing from '@barq/barq'", () => {
      itTransformsSchema(
        "transform class using via `import * as Barq from '@barq/barq'`",
        "import * as Barq from '@barq/barq'; class Person extends Barq.Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );

      itTransformsSchema(
        "transform class using via `import Barq from '@barq/barq'`",
        "import Barq from '@barq/barq'; class Person extends Barq.Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );

      itTransformsSchema(
        "transform class using via `import { Object } from '@barq/barq'`",
        "import { Object } from '@barq/barq'; class Person extends Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );

      itTransformsSchema(
        "transform class using `import Barq, { Object } from '@barq/barq'`",
        "import Barq, { Object } from '@barq/barq'; class Person extends Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );

      itTransformsSchema(
        "transform class using via `import { Object } from '@barq/barq'` and providing type argument",
        "import { Object } from '@barq/barq'; class Person extends Object<Person> {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );
    });

    describe("importing from '@barq/react'", () => {
      itTransformsSchema(
        "transform class using via `import * as BarqReact from '@barq/react'`",
        "import * as BarqReact from '@barq/react'; class Person extends BarqReact.Barq.Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );

      itTransformsSchema(
        "transform class using via `import { Barq } from '@barq/react'`",
        "import { Barq } from '@barq/react'; class Person extends Barq.Object {}",
        (schema) => {
          expect(schema && schema.name).toBe("Person");
        },
      );
    });
  });

  /*
  itTransforms({
    name: "handles property decorators",
    source: "class Person extends Barq.Object { @test() testing: boolean = 0 }",
    extraPlugins: [["@babel/plugin-proposal-decorators", { version: "2021-12" }]],
    test() {
      //
    },
  });
  */

  describe("type transformations", () => {
    describeProperty("boolean", {
      type: "bool",
      defaults: [undefined, true, false],
    });

    describeProperty("int", {
      type: "int",
      defaults: [undefined, 123],
    });

    describeProperty("float", {
      type: "float",
      defaults: [undefined, 123],
    });

    describeProperty("double", {
      type: "double",
      defaults: [undefined, 123],
    });

    describeProperty("string", {
      type: "string",
      defaults: [undefined, "foo"],
    });

    describeProperty("decimal128", {
      type: "decimal128",
      defaults: [
        undefined,
        { source: "new Barq.Types.Decimal128()" },
        { source: "new Types.Decimal128()" },
        { source: "new Barq.Types.Decimal128()" },
        { source: "new Types.Decimal128()" },
      ],
    });

    describeProperty("objectId", {
      type: "objectId",
      defaults: [
        undefined,
        { source: "new Barq.Types.ObjectId()" },
        { source: "new Types.ObjectId()" },
        { source: "new Barq.Types.ObjectId()" },
        { source: "new Types.ObjectId()" },
      ],
    });

    describeProperty("uuid", {
      type: "uuid",
      defaults: [
        undefined,
        { source: "new Barq.Types.UUID()" },
        { source: "new Types.UUID()" },
        { source: "new Barq.Types.UUID()" },
        { source: "new Types.UUID()" },
      ],
    });

    describeProperty("date", {
      type: "date",
      defaults: [
        undefined,
        { source: "new Date()" },
        { source: "new Types.Date()" },
        { source: "new Barq.Types.Date()" },
      ],
    });

    describeProperty("data", {
      type: "data",
      defaults: [
        undefined,
        { source: "new ArrayBuffer()" },
        { source: "new Types.Data()" },
        { source: "new Barq.Types.Data()" },
      ],
    });

    describeProperty("list", {
      type: "list",
      // TODO: Extend the `objectType` being tested
      objectTypes: ["Person", "int"],
      defaults: [undefined, { source: "[]" }],
    });

    describeProperty("set", {
      type: "set",
      // TODO: Extend the `objectType` being tested
      objectTypes: ["Person"],
    });

    describeProperty("dictionary", {
      type: "dictionary",
      // TODO: Extend the `objectType` being tested
      objectTypes: [undefined, "mixed"],
    });

    describeProperty("mixed", {
      type: "mixed",
      defaults: [undefined, "foo", 123],
    });

    describeProperty("link", {
      type: "object",
      objectTypes: ["Person"],
    });

    // LinkingObjects has sufficiently unique syntax that we test it manually
    // rather than with the test generator
    describe("linkingObjects", () => {
      [
        'prop: Barq.Types.LinkingObjects<Person, "friends">;',
        'prop: Types.LinkingObjects<Person, "friends">;',
      ].forEach((code) => {
        it(`transforms: \`${code}\``, () => {
          const transformCode = transformProperty(code);
          const parsedSchema = extractSchema(transformCode);
          const expectedSchema = {
            prop: {
              type: "linkingObjects",
              objectType: "Person",
              property: "friends",
            },
          };

          expect(parsedSchema?.properties).toStrictEqual(expectedSchema);
        });
      });

      describe("error handling", () => {
        it("does not allow the property to be optional", () => {
          expect(() => transformProperty('prop?: Barq.Types.LinkingObjects<Person, "friends">;')).toThrow(
            "Properties of type LinkingObjects cannot be optional",
          );
        });

        it("does not allow the property to be undefined", () => {
          expect(() => transformProperty('prop: Barq.Types.LinkingObjects<Person, "friends"> | undefined;')).toThrow(
            "Properties of type LinkingObjects cannot be optional",
          );
        });

        it("throws if no type parameters are provided", () => {
          expect(() => transformProperty("prop: Barq.Types.LinkingObjects;")).toThrow(
            "Missing type arguments for LinkingObjects",
          );
        });

        it("throws if the incorrect number of type parameters are provided", () => {
          expect(() => transformProperty("prop: Barq.Types.LinkingObjects<Person>;")).toThrow(
            "Incorrect number of type arguments for LinkingObjects",
          );
        });

        it("throws if the first type parameter's type is incorrect", () => {
          expect(() => transformProperty('prop: Barq.Types.LinkingObjects<"Person", "friends">;')).toThrow(
            "First type argument for LinkingObjects should be a reference to the linked object's object type",
          );
        });

        it("throws if the second type parameter's type is incorrect", () => {
          expect(() => transformProperty("prop: Barq.Types.LinkingObjects<Person, friends>;")).toThrow(
            "Second type argument for LinkingObjects should be the property name of the relationship it inverts",
          );
        });
      });
    });

    // This doesn't make a great deal of sense as TS would complain,
    // but is here to document the precedence
    it("the type annotation takes precedence over the type inferred from the property initializer", () => {
      const transformCode = transformProperty(`name: string = 2;`);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.properties).toEqual({ name: { type: "string", default: 2 } });
    });
  });

  describe("static properties", () => {
    it("reads a static property for `name`", () => {
      const transformCode = transformProperty(`static name = 'test';`);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.name).toEqual("test");
    });

    it("reads a static property for `primaryKey`", () => {
      const transformCode = transformProperty(`static primaryKey = 'test';`);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.primaryKey).toEqual("test");
    });

    it("reads a static property for `embedded`", () => {
      const transformCode = transformProperty(`static embedded = true;`);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.embedded).toEqual(true);
    });

    it("reads a static property for `asymmetric`", () => {
      const transformCode = transformProperty(`static asymmetric = true;`);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.asymmetric).toEqual(true);
    });

    it("reads multiple static properties", () => {
      const code = `static name = 'test';
      static primaryKey = 'test';
      static embedded = true;
      static asymmetric = true;`;

      const transformCode = transformProperty(code);
      const parsedSchema = extractSchema(transformCode);

      expect(parsedSchema?.name).toEqual("test");
      expect(parsedSchema?.primaryKey).toEqual("test");
      expect(parsedSchema?.embedded).toEqual(true);
      expect(parsedSchema?.asymmetric).toEqual(true);
    });

    it("throws an error if there is already a static `schema` property", () => {
      expect(() => transformProperty(`static schema = {};`)).toThrow(
        "Classes extending Barq.Object cannot define their own `schema` static, all properties must be defined using TypeScript syntax",
      );
    });
  });

  describe("decorators", () => {
    it("handles `@index` decorators", () => {
      const transformCode = transformProperty(`@index name: Barq.Types.String;`);
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual(true);
    });

    it("handles `@index` decorators from the Barq import", () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @Barq.index name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual(true);
    });

    it("ignores `@index` decorators not imported from `barq`", () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @index name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toBeUndefined();
    });

    it("removes `@index` decorators from the source", () => {
      const transformCode = transformProperty(`@index name: Barq.Types.String;`);
      // This is what Babel outputs for transformed decorators
      expect(transformCode).not.toContain("_applyDecoratedDescriptor");
    });

    it('handles `@index("full-text")` decorators', () => {
      const transformCode = transformProperty(`@index("full-text") name: Barq.Types.String;`);
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual("full-text");
    })

    it('handles `@index("full-text")` decorators from the Barq import', () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @Barq.index("full-text") name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual("full-text");
    });

    it('ignores `@index("full-text")` decorators not imported from `barq`', () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @index("full-text") name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toBeUndefined();
    });

    it('removes `@index("full-text")` decorators from the source', () => {
      const transformCode = transformProperty(`@index("full-text") name: Barq.Types.String;`);
      // This is what Babel outputs for transformed decorators
      expect(transformCode).not.toContain("_applyDecoratedDescriptor");
    });

    it("handles `@mapTo` decorators", () => {
      const transformCode = transformProperty(`@mapTo("rename") name: Barq.Types.String;`);
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).mapTo).toEqual("rename");
    });

    it("handles `@mapTo` decorators from the Barq import", () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @Barq.mapTo('rename') name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).mapTo).toEqual("rename");
    });

    it("handles `@mapTo` decorators on Barq.List", () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @Barq.mapTo('rename') name: Barq.Types.List<Person>; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).mapTo).toEqual("rename");
    });

    it("ignores `@mapTo` decorators not imported from `barq`", () => {
      const transformCode = transform({
        source: `import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";
        export class Person extends Barq.Object { @mapTo("rename") name: Barq.Types.String; }`,
      });
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).mapTo).toBeUndefined();
    });

    it("removes `@mapTo` decorators from the source", () => {
      const transformCode = transformProperty(`@mapTo("rename") name: Barq.Types.String;`);
      // This is what Babel outputs for transformed decorators
      expect(transformCode).not.toContain("_applyDecoratedDescriptor");
    });

    it("handles multiple decorators on a property", () => {
      const transformCode = transformProperty(`@index @mapTo("rename") name: Barq.Types.String;`);
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual(true);
      expect((parsedSchema?.properties.name as PropertySchema).mapTo).toEqual("rename");
    });

    // This does not work in tests, but does work in real code. Leaving disabled for now
    xit("handles decorators with non-null assertions", () => {
      const transformCode = transformProperty(`@index name!: Barq.Types.String;`);
      const parsedSchema = extractSchema(transformCode);

      expect((parsedSchema?.properties.name as PropertySchema).indexed).toEqual(true);
    });
  });

  it("handles a full schema", () => {
    const transformCode = transformProperty(`
      _id: Barq.Types.ObjectId;
      @index
      description: string;
      @mapTo("complete")
      isComplete: boolean;
      createdAt: Date;
      userId: string;`);
    const parsedSchema = extractSchema(transformCode);

    expect(parsedSchema).toEqual({
      name: "Person",
      properties: {
        _id: { type: "objectId" },
        description: { type: "string", indexed: true },
        isComplete: { type: "bool", mapTo: "complete" },
        createdAt: { type: "date" },
        userId: { type: "string" },
      },
    });
  });

  describe("Typescript-only source file support", () => {
    let consoleWarnMock: jest.SpyInstance<void, [message?: any, ...optionalParams: any[]]>;

    beforeEach(() => {
      consoleWarnMock = jest.spyOn(console, "warn").mockImplementation();
    });

    afterEach(() => {
      consoleWarnMock.mockRestore();
    });

    it("outputs an error and does not transform if a non-Typescript source file contains a class extending Barq.Object", () => {
      transform({
        source: `
import Barq, { Types, List, Set, Dictionary, Mixed } from "@barq/barq";

class Test extends Barq.Object {
  static schema = {
    name: 'Task',
    primaryKey: '_id',
    properties: {
      _id: 'objectId',
    }
  }
}`,
        filename: "test.js",
      });

      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenLastCalledWith(
        expect.stringMatching(
          new RegExp("@barq/babel-plugin can only be used with Typescript source files. Ignoring.*"),
        ),
      );
    });

    it("does not output an error if a non-Typescript source file does not contain a class extending Barq.Object", () => {
      transform({
        source: `
class Test {
  static schema = {
    name: 'Task',
    primaryKey: '_id',
    properties: {
      _id: 'objectId',
    }
  }
}`,
        filename: "test.js",
      });

      expect(console.warn).toHaveBeenCalledTimes(0);
    });
  });
});
