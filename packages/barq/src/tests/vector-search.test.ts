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

import { expect } from "chai";

import { Barq } from "../Barq";
import type { ObjectSchema, VectorIndexOptions } from "../schema";
import type { BarqContext } from "./utils";
import { closeBarq, generateTempBarqPath } from "./utils";

describe("vector search", () => {
  beforeEach(function (this: BarqContext) {
    this.barq = new Barq({
      path: generateTempBarqPath(),
      schema: [
        {
          name: "Document",
          primaryKey: "id",
          properties: {
            id: "int",
            embedding: {
              type: "list",
              objectType: "float",
              vector: {
                dimensions: 4,
                metric: "l2",
                encoding: "sq8",
                m: 8,
                efConstruction: 32,
                efSearch: 16,
                buildThreads: 1,
              },
            },
          },
        },
      ],
    });
  });

  afterEach(closeBarq);

  it("uses the full index config for approximate and exact kNN", function (this: BarqContext) {
    this.barq.write(() => {
      this.barq.create("Document", { id: 1, embedding: [1, 0, 0, 0] });
      this.barq.create("Document", { id: 2, embedding: [0, 1, 0, 0] });
      this.barq.create("Document", { id: 3, embedding: [0.9, 0.1, 0, 0] });
    });

    const all = this.barq.objects("Document");
    const approximate = all.knn("embedding", [1, 0, 0, 0], { k: 2 });
    expect(Array.from(approximate, ({ id }) => id)).to.deep.equal([1, 3]);

    const exact = all.knn("embedding", [0, 1, 0, 0], { k: 1, exact: true });
    expect(exact[0].id).to.equal(2);
  });

  it("rejects a negative, NaN or fractional ef", function (this: BarqContext) {
    const all = this.barq.objects("Document");
    for (const ef of [-1, NaN, 1.5]) {
      expect(() => all.knn("embedding", [1, 0, 0, 0], { k: 1, ef })).to.throw(
        "'ef' must be a non-negative integer",
      );
    }
  });

  it("adopts an efSearch-only change on reopen instead of throwing", function (this: BarqContext) {
    const path = this.barq.path;
    this.barq.write(() => {
      this.barq.create("Document", { id: 1, embedding: [1, 0, 0, 0] });
    });
    this.barq.close();

    // efSearch is a query-time knob: reopening with a different value must
    // update the persisted index in place, not fail the open.
    const retuned = new Barq({ path, schema: documentSchema({ efSearch: 64 }) });
    try {
      expect(retuned.objects("Document").knn("embedding", [1, 0, 0, 0], { k: 1 })[0].id).to.equal(1);
    } finally {
      retuned.close();
    }

    // And back to the original declaration — still a clean open.
    const back = new Barq({ path, schema: documentSchema({ efSearch: 16 }) });
    try {
      expect(back.objects("Document").knn("embedding", [1, 0, 0, 0], { k: 1 })[0].id).to.equal(1);
    } finally {
      back.close();
    }
  });

  it("still rejects a graph-shape change on reopen", function (this: BarqContext) {
    const path = this.barq.path;
    this.barq.close();
    expect(() => new Barq({ path, schema: documentSchema({ m: 16 }) })).to.throw(
      "different persisted configuration",
    );
  });
});

/** The Document schema from beforeEach with parts of the vector config overridden. */
function documentSchema(vectorOverrides: Partial<VectorIndexOptions>): ObjectSchema[] {
  return [
    {
      name: "Document",
      primaryKey: "id",
      properties: {
        id: "int",
        embedding: {
          type: "list",
          objectType: "float",
          vector: {
            dimensions: 4,
            metric: "l2",
            encoding: "sq8",
            m: 8,
            efConstruction: 32,
            efSearch: 16,
            buildThreads: 1,
            ...vectorOverrides,
          },
        },
      },
    },
  ];
}
