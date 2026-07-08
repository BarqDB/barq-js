<p align="center">
  <img height="140" src="https://raw.githubusercontent.com/barq/barq-js/main/media/barq-react-logo.svg" alt="Barq React Logo"/>
</p>

<h1 align="center">
  Barq React
</h1>

Build better apps, faster.
## Introduction
Setting up Barq in a React Native application has historically been complex. Re-rendering of components when objects in the database change requires manually adding and removing listeners, which produce a lot of boilerplate code and is error-prone (if listeners properly removed on unmount). This library alleviates that by providing [React hooks](https://reactjs.org/docs/hooks-intro.html) which return Barq data that is state aware. As a consequence, any change to the Barq data will cause components using the hook to re-render.

Documentation for `@barqdb/react` and Barq can be found at [docs.barq.org](https://github.com/BarqDB/barq-js).
## Installation

This library requires `react-native` >= 0.59 and `barq` >= 11

npm:

```
npm install barq @barqdb/react
```

yarn:

```
yarn add barq @barqdb/react
```

## Try it out

Here is a simple task manager application written with Barq React.  Copy into a React Native application and give it a try!

```tsx
import React, { useState } from "react";
import { SafeAreaView, View, Text, TextInput, FlatList, Pressable } from "react-native";
import { Barq, BarqProvider, useBarq, useQuery } from '@barqdb/react'

class Task extends Barq.Object {
  _id!: Barq.Types.ObjectId;
  description!: string;
  isComplete!: boolean;
  createdAt!: Date;

  static generate(description: string) {
    return {
      _id: new Barq.Types.ObjectId(),
      description,
      createdAt: new Date(),
    };
  }

  static schema = {
    name: 'Task',
    primaryKey: '_id',
    properties: {
      _id: 'objectId',
      description: 'string',
      isComplete: { type: 'bool', default: false },
      createdAt: 'date'
    },
  };
}

export default function AppWrapper() {
  return (
    <BarqProvider schema={[Task]}><TaskApp /></BarqProvider>
  )
}

function TaskApp() {
  const barq = useBarq();
  const tasks = useQuery(Task);
  const [newDescription, setNewDescription] = useState("")

  return (
    <SafeAreaView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', margin: 10 }}>
        <TextInput
          value={newDescription}
          placeholder="Enter new task description"
          onChangeText={setNewDescription}
        />
        <Pressable
          onPress={() => {
            barq.write(() => {
              barq.create("Task", Task.generate(newDescription));
            });
            setNewDescription("")
          }}><Text>➕</Text></Pressable>
      </View>
      <FlatList data={tasks.sorted("createdAt")} keyExtractor={(item) => item._id.toHexString()} renderItem={({ item }) => {
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'center', margin: 10 }}>
            <Pressable
              onPress={() =>
                barq.write(() => {
                  item.isComplete = !item.isComplete
                })
              }><Text>{item.isComplete ? "✅" : "☑️"}</Text></Pressable>
            <Text style={{ paddingHorizontal: 10 }} >{item.description}</Text>
            <Pressable
              onPress={() => {
                barq.write(() => {
                  barq.delete(item)
                })
              }} ><Text>{"🗑️"}</Text></Pressable>
          </View>
        );
      }} ></FlatList>
    </SafeAreaView >
  );
}
```

For a full fledged example, check out [our templates](https://github.com/BarqDB/barq-js#template-apps-using-expo-for-react-native).


## Barq Hooks

### useBarq
Returns the instance of the [`Barq`](https://github.com/BarqDB/barq-js) configured by `createBarqContext` and the `BarqProvider`.  The following is an example of how to use this Hook to make a write transaction callback for a component.

```tsx
import {useBarq} from '@barqdb/react';
// assume props contain item a Barq.Object
const Component = ({item}) => {
  const barq = useBarq();
  const toggleComplete = useCallback((item) => {
    barq.write(() => {
      item.isComplete = !item.isComplete
    })
  },[item, barq])

  return (
    <Pressable
      onPress={() =>
        barq.write(() => {
          item.isComplete = !item.isComplete
        })
      }><Text>{item.isComplete ? "✅" : "☑️"}</Text>
    </Pressable>
  )
}
```

### useQuery

Returns [`Barq.Results`](https://github.com/BarqDB/barq-js) from a given type. This Hook will update on any changes to any Object in the Collection and return an empty array if the Collection is empty.
The result of this can be consumed directly by the `data` argument of any React Native [`VirtualizedList`](https://reactnative.dev/docs/virtualizedlist) or [`FlatList`](https://reactnative.dev/docs/flatlist).  If the component used for the list's `renderItem` prop is wrapped with [`React.Memo`](https://reactjs.org/docs/react-api.html#reactmemo), then only the modified object will re-render.

```tsx
import {useQuery} from '@barqdb/react';

const Component = () => {
  // ObjectClass is a class extending Barq.Object, which should have been provided in the Barq Config.
  // It is also possible to use the model's name as a string ( ex. "Object" ) if you are not using class based models.
  const sortedCollection = useQuery({
    type: ObjectClass,
    query: (collection) => {
      // The methods `sorted` and `filtered` should be passed as a `query` function.
      // Any variables that are dependencies of this should be placed in the dependency array.
      return collection.sorted();
    }
  }, []);

  return (
    <FlatList data={sortedCollection} renderItem={({ item }) => <Object item={item}/>
  )
}
```

### useObject
 Returns a [`Barq.Object`](https://github.com/BarqDB/barq-js) for a given type and primary key.  The Hook will update on any changes to the properties on the returned Object and return `null` if it either doesn't exist or has been deleted.

```tsx
import {useObject} from '@barqdb/react';

const Component = ({someId}) => {
  // ObjectClass is a class extending Barq.Object, which should have been provided in the Barq Config.
  // It is also possible to use the model's name as a string ( ex. "Object" ) if you are not using class based models.
  const object = useObject(ObjectClass, someId);

  return (
    <View>
      <Text>{object.name}</Text>
    </View>
  )
}
```
## Setting Things Up
### BarqProvider

To get started with `@barqdb/react`, one must wrap your app with a `BarqProvider`. The `BarqProvider` can be configured using props.  At a minimum, one must set the `schema` prop to the Barq models that they have configured.
Any child of the BarqProvider will be able to use the hooks to access and manipulate Barq data. Here is an example of how to setup Barq React with a Task model:

```tsx
import { BarqProvider, useQuery, Barq } from '@barqdb/react';

const AppWrapper = () => {
  return (
    <BarqProvider schema={[Item]}>
      <SomeComponent/>
    </BarqProvider>
  )
}

const SomeComponent = () => {
  const items = useQuery(Item)
  //..
}

```

The `BarqProvider` also comes with a fallback prop that is rendered when while awaiting for the Barq to open. For local Barq, this is instant, but for synced a Barq, it can take time for larger datasets to sync, especially if it's the first time the app has been opened.  In that case, it is recommended to provide a loading component as a fallback.

```tsx
const AppWrapper = () => {
  return (
    <BarqProvider fallback={<Loading/>} >
      <App/>
    <BarqProvider>
  )
}
```

In some cases, it may be necessary to access the configured Barq from outside of the `BarqProvider`, for instance, implementing a client reset fallback.  This can be done by creating a `ref` with `useRef` and setting the `barqRef` property of `BarqProvider`.

```tsx
const AppWrapper = () => {
  const barqRef = useRef<Barq|null>(null)

  return (
    <BarqProvider barqRef={barqRef}>
      <App/>
    <BarqProvider>
  )
}
```

It may also be necessary to render multiple `BarqProvider`s of the same Barq in an app. In this case, the flag `closeOnUnmount` can be set to `false`` to prevent both Barq instances from closing when one has been removed from the component tree.
This is set to `true` by default.

```tsx
const AppWrapper = () => {
  return (
    <BarqProvider closeOnUnmount={false}>
      <App/>
    <BarqProvider>
  )
}
```
### Dynamically Updating a Barq Configuration

It is possible to update the barq configuration by setting props on the `BarqProvider`.  The `BarqProvider` takes props for all possible barq configuration properties.

For example, one could setup the sync configuration based on a user state:

```tsx
const [user, setUser] = useState()

//... some logic to get user state

<BarqProvider sync={{ user, partition }}>
```


## Multiple Barqs
`createBarqContext` can be used to create a contextualized hooks and a BarqProvider to the passed in configuration for a Barq. It can be called multiple times if your app requires more than one Barq.  In that case, you would have multiple `BarqProvider`s that wrap your app and must use the hooks from the created context you wish to access.

The Context object will contain a `BarqProvider`, which will a open a Barq when it is rendered. It also contains a set of hooks that can be used by children to the `BarqProvider` to access and manipulate Barq data.

The structure of the Context object is:

```
{
  BarqProvider, // Wrapper for your application to enable usage of hooks
  useBarq, // Hook to access the configured Barq
  useQuery, // Hook to access collections of Barq objects
  useObject, // Hook to access a single Barq object by primary key
}
```

The configuration for the Barq context can be given as an object argument to `createBarqContext` or be set directly on the `BarqProvider` props. The props set on `BarqProvider` will be merged with those provided to `createBarqContext`, with the props taking priority.  A Barq will be opened with this merged configuration when the Barq Context Provider is rendered.  A fallback component can optionally be rendered until the Barq is opened.  This is useful for projects using Barq Sync.

```tsx
const { BarqProvider: PublicBarqProvider, useBarq: usePublicBarq, useObject: usePublicObject, useQuery: usePublicQuery } = createBarqContext(publicConfig);
const { BarqProvider: PrivateBarqProvider, useBarq: usePrivateBarq, useObject: usePrivateObject, useQuery: usePrivateQuery } = createBarqContext(privateConfig);
```

It is also possible to call it without any Config; in the case that you want to do all your configuration through the `BarqProvider` props.


### Sync Debug Logs
When running into issues with sync, it may be helpful to view logs in order to determine what the issue was or to provide more context when submitting an issue. Set the log level and a logger on `Barq` before opening a synced database:

```ts
import { Barq } from "@barqdb/barq";

Barq.setLogLevel("trace");
Barq.setLogger((level, message) => console.log(`[${level}]: ${message}`));
```
