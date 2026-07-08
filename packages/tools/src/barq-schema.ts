#!/usr/bin/env node
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

import Barq from "@barqdb/barq";
import { ArgumentConfig, parse } from "ts-command-line-args";
import * as fs from "fs";

type Relationship = {
  from: string;
  to: string;
};

type ExtractSchemaArgs = {
  inputFileName?: string;
  outputFileName?: string;
  format?: string;
  help?: boolean;
};

type FormatterFunction = (r: Barq) => void;
type Formatters = {
  [key: string]: FormatterFunction;
};

const mermaid: FormatterFunction = (barq: Barq) => {
  const collectionTypes = ["list", "dictionary", "set"];
  const primitiveTypes = ["bool", "int", "float", "double", "string", "date", "objectId", "uuid", "data", "mixed"];
  writer("```mermaid");
  writer("classDiagram");

  const relationships: Array<Relationship> = [];
  barq.schema.forEach((objectSchema) => {
    const name = objectSchema.name;
    writer(`class ${name} {`);
    Object.keys(objectSchema.properties).forEach((propertyName) => {
      const prop = objectSchema.properties[propertyName] as Barq.ObjectSchemaProperty;
      if (collectionTypes.includes(prop.type) || prop.type === "object") {
        const objectType = prop.objectType ?? "__unknown__";
        if (!primitiveTypes.includes(objectType)) {
          relationships.push({ from: name, to: objectType });
        }
        if (prop.type === "object") {
          writer(`  +${objectType} ${propertyName}`);
        } else {
          writer(`  +${prop.type}~${objectType}~ ${propertyName}`);
        }
      } else {
        writer(`  +${prop.type} ${propertyName}`);
      }
    });
    writer("}");
  });
  relationships.forEach((relationship) => {
    writer(`${relationship.to} <-- ${relationship.from}`);
  });
  writer("```");
};

const json: FormatterFunction = (barq: Barq) => {
  writer(JSON.stringify(barq.schema));
};

const formatters: Formatters = {
  mermaid,
  json,
};

const argumentConfig: ArgumentConfig<ExtractSchemaArgs> = {
  inputFileName: {
    alias: "i",
    type: String,
    multiple: false,
    optional: true,
    defaultValue: "default.barq",
    description: "Input file name",
  },
  outputFileName: {
    alias: "o",
    type: String,
    multiple: false,
    optional: true,
    defaultValue: "-",
    description: "Output file name",
  },
  format: {
    alias: "f",
    type: String,
    multiple: false,
    optional: true,
    defaultValue: "mermaid",
    description: `Output format (${Object.keys(formatters).join(", ")})`,
  },
  help: { alias: "h", type: Boolean, optional: true, description: "Prints this usage guide" },
};

const args = parse(argumentConfig, { partial: true }, true, true);

if (Object.keys(args).includes("_unknown") || args.help) {
  args._commandLineResults.printHelp();
  process.exit();
}

let fd = 0;
if (args.outputFileName && args.outputFileName !== "-") {
  fd = fs.openSync(args.outputFileName, "w");
}

function writer(line: string) {
  if (fd) {
    fs.writeSync(fd, line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

if (args.format) {
  if (formatters[args.format]) {
    const barq = new Barq({ path: args.inputFileName });
    formatters[args.format](barq);
    barq.close();
  } else {
    console.error(`Formatter '${args.format} is not supported.`);
  }
} else {
  console.error(`You must specify a formatter: ${Object.keys(formatters).join(", ")}`);
}
