// This TS version of the Task model shows how to create Barq objects using
// TypeScript syntax, using `@barq/babel-plugin`
// (https://github.com/BarqDB/barq-js/blob/main/packages/babel-plugin/).
//
// If you are not using TypeScript and `@barq/babel-plugin`, you instead need
// to defining a schema on the class - see `Task.js` in the Barq example app
// for an example of this.

import Barq, {Types} from '@barq/barq';

// To use a class as a Barq object type in Typescript with the `@barq/babel-plugin` plugin,
// simply define the properties on the class with the correct type and the plugin will convert
// it to a Barq schema automatically.
export class Task extends Barq.Object {
  _id: Types.ObjectId = new Types.ObjectId();
  description!: string;
  isComplete: boolean = false;
  createdAt: Date = new Date();
  userId!: string;

  static primaryKey = '_id';
}
