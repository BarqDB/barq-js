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

import { assert, expect } from "chai";
import path from "path";
import fs from "fs";

import { Barq } from "../Barq";
import { BarqObject } from "../Object";
import { Results } from "../Results";
import type { CanonicalObjectSchema } from "../schema";

import type { BarqContext } from "./utils";
import { BARQS_DIR, closeBarq, generateRandomInteger, generateTempBarqPath } from "./utils";

type Person = { name: string; age?: number };
type PersonWithFriend = { name: string; age?: number; bestFriend: Person | null };

const SIMPLE_BARQ_PATH = path.resolve(BARQS_DIR, "simple.barq");

describe("Milestone #2", () => {
  describe("Opening default local Barq", () => {
    it("can read schema from disk", () => {
      const barq = new Barq({ path: SIMPLE_BARQ_PATH });
      try {
        const schema = barq.schema;
        const expectedSchema: CanonicalObjectSchema[] = [
          {
            ctor: undefined,
            embedded: false,
            asymmetric: false,
            name: "Person",
            primaryKey: "name",
            properties: {
              name: {
                name: "name",
                type: "string",
                presentation: undefined,
                optional: false,
                indexed: true,
                mapTo: "name",
                default: undefined,
              },
              age: {
                default: undefined,
                indexed: true,
                mapTo: "age",
                name: "age",
                optional: true,
                type: "int",
                presentation: undefined,
              },
              bestFriend: {
                indexed: false,
                mapTo: "bestFriend",
                name: "bestFriend",
                optional: true,
                type: "object",
                objectType: "Person",
                presentation: undefined,
                default: undefined,
              },
            },
          },
        ];
        expect(schema).deep.equals(expectedSchema);
      } finally {
        barq.close();
      }
    });
  });

  describe("Reading an object by primary key", () => {
    before(function (this: BarqContext) {
      this.barq = new Barq({ path: SIMPLE_BARQ_PATH });
    });
    after(closeBarq);

    it("returns an instance of BarqObject", function (this: BarqContext) {
      const alice = this.barq.objectForPrimaryKey("Person", "Alice");
      expect(alice).instanceOf(BarqObject);
    });

    it("returns a spreadable object", function (this: BarqContext) {
      const alice = this.barq.objectForPrimaryKey<PersonWithFriend>("Person", "Alice");
      assert(alice);
      expect(alice.keys()).deep.equals(["name", "bestFriend", "age"]);
      const spread = { ...alice };
      expect(Object.keys(spread)).deep.equals(alice.keys());
      expect(spread.name).deep.equals(alice.name);
    });
  });

  describe("Reading a “string” property from an object", () => {
    before(function (this: BarqContext) {
      this.barq = new Barq({ path: SIMPLE_BARQ_PATH });
    });
    after(closeBarq);

    it("returns the correct string", function (this: BarqContext) {
      const alice = this.barq.objectForPrimaryKey<Person>("Person", "Alice");
      assert(alice);
      expect(alice.name).equals("Alice");
    });
  });

  describe("Follow an object “link” from an object to another", () => {
    before(function (this: BarqContext) {
      this.barq = new Barq({ path: SIMPLE_BARQ_PATH });
    });
    after(closeBarq);

    it("returns the correct object", function (this: BarqContext) {
      const alice = this.barq.objectForPrimaryKey<PersonWithFriend>("Person", "Alice");
      assert(alice);
      assert(alice.bestFriend instanceof BarqObject);
      expect(alice.bestFriend.name).equals("Bob");
    });
  });

  describe("Writing a “string” property to an existing object", () => {
    before(function (this: BarqContext) {
      // Start from the simple file to avoid populating a schema nor updating the file
      const path = generateTempBarqPath();
      fs.copyFileSync(SIMPLE_BARQ_PATH, path);
      this.barq = new Barq({ path });
    });
    after(closeBarq);

    it("persists the value", function (this: BarqContext) {
      const charlie = this.barq.objectForPrimaryKey<Person>("Person", "Charlie");
      assert(charlie);
      this.barq.write(() => {
        charlie.age = 11;
        expect(charlie.age).equals(11);
        charlie.age = 10;
        expect(charlie.age).equals(10);
      });
    });
  });

  describe("Writing a “link” property to an existing object", () => {
    before(function (this: BarqContext) {
      // Start from the simple file to avoid populating a schema nor updating the file
      const path = generateTempBarqPath();
      fs.copyFileSync(SIMPLE_BARQ_PATH, path);
      this.barq = new Barq({ path });
    });
    after(closeBarq);

    it("persists the value", function (this: BarqContext) {
      const alice = this.barq.objectForPrimaryKey<PersonWithFriend>("Person", "Alice");
      assert(alice);
      const bob = this.barq.objectForPrimaryKey<PersonWithFriend>("Person", "Bob");
      this.barq.write(() => {
        alice.bestFriend = null;
        expect(alice.bestFriend).equals(null);
        alice.bestFriend = bob;
        const { bestFriend } = alice;
        assert(bestFriend);
        expect(bestFriend.name).equals("Bob");
      });
    });
  });

  describe("Create a new object, specifying property values", () => {
    before(function (this: BarqContext) {
      // Start from the simple file to avoid populating a schema nor updating the file
      const path = generateTempBarqPath();
      fs.copyFileSync(SIMPLE_BARQ_PATH, path);
      this.barq = new Barq({ path });
    });
    after(closeBarq);

    it("persists the object and its value", function (this: BarqContext) {
      const name = "Darwin #" + generateRandomInteger();
      const person = this.barq.write(() => {
        return this.barq.create<Person>("Person", { name });
      });
      expect(person.name).equals(name);
    });
  });

  describe("Declaring a schema #1", () => {
    afterEach(closeBarq);

    it("supports properties of type 'string'", function (this: BarqContext) {
      const path = generateTempBarqPath();
      this.barq = new Barq({ path, schema: [{ name: "Person", properties: { name: "string" } }] });
      const person = this.barq.write(() => {
        return this.barq.create("Person", { name: "Alice" });
      });
      expect(person.name).equals("Alice");
    });

    it("supports properties of type 'link'", function (this: BarqContext) {
      const path = generateTempBarqPath();
      this.barq = new Barq({
        path,
        schema: [{ name: "Person", properties: { name: "string", bestFriend: "Person" } }],
      });
      const { alice, bob } = this.barq.write(() => {
        const alice = this.barq.create<PersonWithFriend>("Person", { name: "Alice", bestFriend: null });
        const bob = this.barq.create<PersonWithFriend>("Person", { name: "Bob", bestFriend: alice });
        return { alice, bob };
      });
      expect(alice.name).equals("Alice");
      expect(bob.name).equals("Bob");
      assert(bob.bestFriend instanceof BarqObject);
      expect(bob.bestFriend.name).equals("Alice");
    });

    it("supports properties of type 'list<link>'", function (this: BarqContext) {
      const path = generateTempBarqPath();
      this.barq = new Barq({
        path,
        schema: [{ name: "Person", properties: { name: "string", bestFriend: "Person", friends: "Person[]" } }],
      });
      // Actually, this part of the milestone doesn't entail reading lists from the database
      /*
      const { alice, bob } = this.barq.write(() => {
        const alice = this.barq.create<PersonWithFriends>("Person", { name: "Alice", bestFriend: null, friends: [] });
        const bob = this.barq.create<PersonWithFriends>("Person", {
          name: "Bob",
          bestFriend: alice,
          friends: [alice],
        });
        return { alice, bob };
      });
      expect(alice.name).equals("Alice");
      expect(bob.name).equals("Bob");
      assert(bob.bestFriend instanceof BarqObject);
      expect(bob.bestFriend.name).equals("Alice");
      expect(bob.friends[0].name).equals("Alice");
      */
    });
  });

  describe("Querying database for objects of a specific type", () => {
    before(function (this: BarqContext) {
      this.barq = new Barq({ path: SIMPLE_BARQ_PATH });
    });
    after(closeBarq);

    it("return Results", function (this: BarqContext) {
      const persons = this.barq.objects("Person");
      expect(persons).instanceOf(Results);
      expect(persons.length).greaterThan(0);
      expect(persons.length).equals([...persons.keys()].length);
      const alice = persons.find((p) => p.name === "Alice");
      if (!alice) {
        throw new Error("Expected an object");
      }
      expect(alice).instanceOf(BarqObject);
      expect(alice.name).equals("Alice");
    });

    it("allows random index access", function (this: BarqContext) {
      const persons = this.barq.objects("Person");
      expect(persons).instanceOf(Results);
      expect(persons.length).greaterThan(0);
      expect(persons[0]).instanceOf(BarqObject);
    });

    it("allows object spreads", function (this: BarqContext) {
      const persons = this.barq.objects("Person");
      expect(persons).instanceOf(Results);
      expect(persons.length).greaterThan(0);
      const spread = { ...persons };
      expect(Object.keys(spread));
    });
  });
});
