// This TS version of the Task model shows how to create Realm objects using
// TypeScript syntax, using `@barq/babel-plugin`
// (https://github.com/BarqDB/barq-js/blob/main/packages/babel-plugin/).
//
// If you are not using TypeScript and `@barq/babel-plugin`, you instead need
// to defining a schema on the class - see `Task.js` in the Realm example app
// for an example of this.

import Realm, {BSON} from '@barq/barq';

// To use a class as a Realm object type in Typescript with the `@barq/babel-plugin` plugin,
// simply define the properties on the class with the correct type and the plugin will convert
// it to a Realm schema automatically.
export class Task extends Realm.Object {
  _id: BSON.ObjectId = new BSON.ObjectId();
  description!: string;
  isComplete: boolean = false;
  createdAt: Date = new Date();
  userId!: string;

  static primaryKey = '_id';
}
