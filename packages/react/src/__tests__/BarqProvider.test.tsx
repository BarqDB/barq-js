////////////////////////////////////////////////////////////////////////////
//
// Copyright 2021 Realm Inc.
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

import React, { useRef, useState } from "react";
import Barq, { User } from "@barq/barq";
import { Button, Text, View } from "react-native";
import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react-native";

import { BarqProvider, createBarqContext } from "..";
import {
  BarqProviderFallback,
  BarqProviderFromBarq,
  areConfigurationsIdentical,
  mergeBarqConfiguration,
} from "../BarqProvider";
import { randomBarqPath } from "./helpers";
import { BarqContext } from "../BarqContext";
import { MockedProgressBarqPromiseWithDelay, mockBarqOpen } from "./mocks";

const dogSchema: Barq.ObjectSchema = {
  name: "dog",
  primaryKey: "_id",
  properties: {
    _id: "int",
    name: "string",
  },
};

const catSchema: Barq.ObjectSchema = {
  name: "cat",
  primaryKey: "_id",
  properties: {
    _id: "int",
    name: "string",
  },
};

const withConfigBarqContext = createBarqContext({
  schema: [dogSchema],
  inMemory: true,
  path: randomBarqPath(),
});

describe("BarqProvider", () => {
  afterEach(() => {
    Barq.clearTestState();
  });

  describe("with a Barq Configuration", () => {
    const { BarqProvider, useBarq } = withConfigBarqContext;

    it("returns the configured barq with useBarq", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => <BarqProvider>{children}</BarqProvider>;
      const { result } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;
      expect(barq).toBeInstanceOf(Barq);
      expect(barq.schema[0].name).toBe("dog");
    });

    it("closes barq on unmount by default", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => <BarqProvider>{children}</BarqProvider>;
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;
      unmount();
      expect(barq.isClosed).toBe(true);
    });

    it("does not close barq on unmount if closeOnUnmount is false", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BarqProvider closeOnUnmount={false}>{children}</BarqProvider>
      );
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;
      unmount();
      expect(barq.isClosed).toBe(false);
    });

    it("will override the configuration provided in createBarqContext", async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BarqProvider schema={[catSchema]}>{children}</BarqProvider>
      );
      const { result } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;
      expect(barq).toBeInstanceOf(Barq);
      expect(barq.schema[0].name).toBe("cat");
    });

    it("can be provided in multiple parts of an application", async () => {
      const BarqComponent = () => {
        const barq = useBarq();
        return (
          <Button
            testID="action"
            title="toggle"
            onPress={() =>
              barq.write(() => {
                barq.create("dog", { _id: new Date().getTime(), name: "Rex" });
              })
            }
          />
        );
      };
      const App = () => {
        const [toggleComponent, setToggleComponent] = useState(true);
        return (
          <>
            <View testID="firstBarqProvider">
              <BarqProvider>
                <BarqComponent />
              </BarqProvider>
            </View>
            {toggleComponent && (
              <View testID="secondBarqProvider">
                <BarqProvider>
                  <View />
                </BarqProvider>
              </View>
            )}
            <Button testID="toggle" title="toggle" onPress={() => setToggleComponent(!toggleComponent)} />
          </>
        );
      };
      const { getByTestId } = render(<App />);
      const secondBarqProvider = getByTestId("secondBarqProvider");
      const toggleComponent = getByTestId("toggle");
      const actionComponent = await waitFor(() => getByTestId("action"));

      expect(secondBarqProvider).not.toBeEmptyElement();

      await act(async () => {
        fireEvent.press(toggleComponent);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      expect(() => getByTestId("secondBarqProvider")).toThrow(
        "Unable to find an element with testID: secondBarqProvider",
      );

      // This is actually a bug that we need to fix on a deeper level
      await act(async () => {
        expect(() => fireEvent.press(actionComponent)).toThrow("Cannot access barq that has been closed.");
      });
    });

    it("handles state changes to its configuration", async () => {
      const BarqComponent = () => {
        const barq = useBarq();
        return <Text testID="schemaName">{barq.schema[0].name}</Text>;
      };
      const App = () => {
        const [schema, setSchema] = useState(dogSchema);
        return (
          <>
            <View testID="firstBarqProvider">
              <BarqProvider schema={[schema]}>
                <BarqComponent />
              </BarqProvider>
            </View>
            <Button testID="changeSchema" title="change schema" onPress={() => setSchema(catSchema)} />
          </>
        );
      };
      const { getByTestId } = render(<App />);
      const schemaNameContainer = await waitFor(() => getByTestId("schemaName"));
      const changeSchemaButton = getByTestId("changeSchema");

      expect(schemaNameContainer).toHaveTextContent("dog");

      await act(async () => {
        fireEvent.press(changeSchemaButton);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });

      // Changing the barq provider configuration will cause a comlete new remount
      // of the child component.  Therefore it must be retreived again
      const newSchemaNameContainer = getByTestId("schemaName");

      expect(newSchemaNameContainer).toHaveTextContent("cat");
    });

    it("can access barq through barqRef as a forwarded ref", async () => {
      const BarqComponent = () => {
        const barq = useBarq();
        return <Text testID="schemaName">{barq.schema[0].name}</Text>;
      };
      const App = () => {
        const barqRef = useRef<Barq | null>(null);
        const [path, setPath] = useState("");
        return (
          <>
            <View testID="firstBarqProvider">
              <BarqProvider barqRef={barqRef} schema={[dogSchema]} path="testPath.barq">
                <BarqComponent />
              </BarqProvider>
            </View>
            <Button
              testID="toggleRefPath"
              title="toggle ref path"
              onPress={() => setPath(barqRef?.current?.path ?? "")}
            />
            {barqRef.current && <Text testID="barqRefPath">{path}</Text>}
          </>
        );
      };
      const { getByTestId, queryByTestId } = render(<App />);
      await waitFor(() => getByTestId("schemaName"));
      const toggleRefPath = getByTestId("toggleRefPath");

      // Wait a tick for the BarqProvider to set the reference and then call a function that uses the ref
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        fireEvent.press(toggleRefPath);
      });

      const barqRefPathText = await waitFor(() => queryByTestId("barqRefPath"));

      expect(barqRefPathText).toHaveTextContent("testPath.barq", { exact: false });
    });

    // TODO: Now that local barq is immediately set, the fallback never renders.
    // We need to test synced barq in order to produce the fallback
    describe("initially renders a fallback, until barq exists", () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("as a component", async () => {
        const slowBarqOpen = mockBarqOpen();
        const App = () => {
          return (
            <BarqProvider sync={{}} fallback={() => <View testID="fallbackContainer" />}>
              <View testID="testContainer" />
            </BarqProvider>
          );
        };
        const { queryByTestId } = render(<App />);

        expect(queryByTestId("fallbackContainer")).not.toBeNull();
        expect(queryByTestId("testContainer")).toBeNull();

        await act(async () => await slowBarqOpen);

        expect(queryByTestId("fallbackContainer")).toBeNull();
        expect(queryByTestId("testContainer")).not.toBeNull();
      });

      it("as an element", async () => {
        const slowBarqOpen = mockBarqOpen();

        const Fallback = <View testID="fallbackContainer" />;
        const App = () => {
          return (
            <BarqProvider sync={{}} fallback={Fallback}>
              <View testID="testContainer" />
            </BarqProvider>
          );
        };
        const { queryByTestId } = render(<App />);

        expect(queryByTestId("fallbackContainer")).not.toBeNull();
        expect(queryByTestId("testContainer")).toBeNull();

        await act(async () => await slowBarqOpen);

        expect(queryByTestId("fallbackContainer")).toBeNull();
        expect(queryByTestId("testContainer")).not.toBeNull();
      });

      it.skip("should receive progress information", async () => {
        const expectedProgressValues = [0, 0.25, 0.5, 0.75, 1];
        const slowBarqOpen = mockBarqOpen(
          new MockedProgressBarqPromiseWithDelay({ progressValues: expectedProgressValues }),
        );
        const renderedProgressValues: number[] = [];

        const Fallback: BarqProviderFallback = ({ progress }) => {
          renderedProgressValues.push(progress);
          return <View testID="fallbackContainer">{progress}</View>;
        };
        const App = () => {
          return (
            <BarqProvider sync={{}} fallback={Fallback}>
              <View testID="testContainer" />
            </BarqProvider>
          );
        };
        const { queryByTestId } = render(<App />);

        expect(queryByTestId("fallbackContainer")).not.toBeNull();
        expect(queryByTestId("testContainer")).toBeNull();
        expect(renderedProgressValues).toStrictEqual([expectedProgressValues[0]]);

        await act(async () => await slowBarqOpen);

        expect(queryByTestId("fallbackContainer")).toBeNull();
        expect(queryByTestId("testContainer")).not.toBeNull();

        expect(renderedProgressValues).toStrictEqual(expectedProgressValues);
      });
    });
  });

  describe("with an existing Barq instance", () => {
    let existingBarqInstance: Barq;
    let barqContextWithBarqInstance: BarqContext<BarqProviderFromBarq>;

    beforeEach(() => {
      existingBarqInstance = new Barq({
        schema: [dogSchema],
        inMemory: true,
        path: randomBarqPath(),
      });

      barqContextWithBarqInstance = createBarqContext(existingBarqInstance);
    });

    it("returns the given barq with useBarq", async () => {
      const { BarqProvider, useBarq } = barqContextWithBarqInstance;

      const wrapper = ({ children }: { children: React.ReactNode }) => <BarqProvider>{children}</BarqProvider>;
      const { result } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;

      expect(barq).toStrictEqual(existingBarqInstance);
    });

    it("does not need a BarqProvider to be wrapped", async () => {
      const { useBarq } = barqContextWithBarqInstance;

      const wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;
      const { result } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;

      expect(barq).toStrictEqual(existingBarqInstance);
    });

    it("does not close barq on unmount by default", async () => {
      const { BarqProvider, useBarq } = barqContextWithBarqInstance;

      const wrapper = ({ children }: { children: React.ReactNode }) => <BarqProvider>{children}</BarqProvider>;
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });
      await waitFor(() => expect(result.current).not.toBe(null));
      const barq = result.current;
      unmount();
      expect(barq.isClosed).toBe(false);
      expect(existingBarqInstance.isClosed).toBe(false);
    });
  });

  describe("with an initially empty context", () => {
    const emptyBarqContext = createBarqContext();

    it("should use Barq instance if barq prop is passed", () => {
      const existingBarq = new Barq({
        schema: [dogSchema],
        inMemory: true,
        path: randomBarqPath(),
      });
      const { BarqProvider, useBarq } = emptyBarqContext;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BarqProvider barq={existingBarq}>{children}</BarqProvider>
      );
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });

      expect(result.current.isClosed).toBe(false);
      expect(result.current).toStrictEqual(existingBarq);

      unmount();
      // Closing a barq should not be managed by the provider if an existing instance was given
      expect(result.current.isClosed).toBe(false);
    });

    it("should use Barq configuration if any config props are passed", () => {
      const { BarqProvider, useBarq } = emptyBarqContext;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BarqProvider schema={[dogSchema]}>{children}</BarqProvider>
      );
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });

      expect(result.current.schema.length).toEqual(1);
      expect(result.current.schema[0].name).toEqual(dogSchema.name);

      expect(result.current.isClosed).toBe(false);
      unmount();
      // Closing a barq should be managed by the provider by default if an existing instance was given
      expect(result.current.isClosed).toBe(true);
    });

    it("should use an empty Barq configuration by default if no props are passed", () => {
      const { BarqProvider, useBarq } = emptyBarqContext;

      const wrapper = ({ children }: { children: React.ReactNode }) => <BarqProvider>{children}</BarqProvider>;
      const { result, unmount } = renderHook(() => useBarq(), { wrapper });

      expect(result.current.schema.length).toEqual(0);

      expect(result.current.isClosed).toBe(false);
      unmount();
      // Closing a barq should be managed by the provider by default if an existing instance was given
      expect(result.current.isClosed).toBe(true);
    });

    it("throws an error when both barq and configuration props are provided", () => {
      expect(() =>
        render(
          // @ts-expect-error The barq and configuration props should be mutually exclusive
          <BarqProvider barq={new Barq()} schema={[]}>
            ...
          </BarqProvider>,
        ),
      ).toThrow("Cannot use configuration props when using an existing Barq instance.");
    });
  });

  describe("with multiple providers", () => {
    const createBarqObjectCreator =
      (barqContext: BarqContext<unknown>) =>
      ({ testID }: { testID: string }) => {
        const { useBarq } = barqContext;
        const barq = useBarq();
        return (
          <Button
            testID={testID}
            title="toggle"
            onPress={() =>
              barq.write(() => {
                barq.create("dog", { _id: new Date().getTime(), name: "Rex" });
              })
            }
          />
        );
      };

    const WithConfig = withConfigBarqContext;

    it("can have multiple providers with config and with barq", async () => {
      const existingBarqInstance = new Barq({
        schema: [dogSchema],
        inMemory: true,
        path: randomBarqPath(),
      });

      const WithBarqInstance = createBarqContext(existingBarqInstance);
      const WithConfigObjectCreator = createBarqObjectCreator(WithConfig);
      const WithConfigProviderComponent = ({ children }: { children?: React.ReactNode }) => (
        <View testID="firstBarqProvider">
          <WithConfig.BarqProvider>
            {children}
            <WithConfigObjectCreator testID="with-config-action" />
          </WithConfig.BarqProvider>
        </View>
      );
      const { result: withConfigResult } = renderHook(() => WithConfig.useBarq(), {
        wrapper: WithConfigProviderComponent,
      });
      const withConfigBarq = withConfigResult.current;

      const WithBarqObjectCreator = createBarqObjectCreator(WithBarqInstance);
      const WithBarqInstanceProviderComponent = ({ children }: { children?: React.ReactNode }) => (
        <View testID="secondBarqProvider">
          <WithBarqInstance.BarqProvider>
            {children}
            <WithBarqObjectCreator testID="with-barq-action" />
          </WithBarqInstance.BarqProvider>
        </View>
      );
      const { result: withBarqInstanceResult } = renderHook(() => WithBarqInstance.useBarq(), {
        wrapper: WithBarqInstanceProviderComponent,
      });
      const withBarqInstanceBarq = withBarqInstanceResult.current;

      expect(withBarqInstanceBarq.path).not.toEqual(withConfigBarq.path);

      expect(withBarqInstanceBarq.objects(dogSchema.name).length).toEqual(0);
      expect(existingBarqInstance.objects(dogSchema.name).length).toEqual(0);
      expect(withConfigBarq.objects(dogSchema.name).length).toEqual(0);

      const pressButton = async (testId: string) => {
        const toggleComponent = getByTestId(testId);
        await act(async () => {
          fireEvent.press(toggleComponent);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        });
      };

      const App = () => {
        const [toggleComponent, setToggleComponent] = useState(true);
        return (
          <>
            <WithConfigProviderComponent />
            {toggleComponent && <WithBarqInstanceProviderComponent />}
            <Button testID="toggle" title="toggle" onPress={() => setToggleComponent(!toggleComponent)} />
          </>
        );
      };

      const { getByTestId } = render(<App />);

      const secondBarqProvider = getByTestId("secondBarqProvider");

      expect(secondBarqProvider).not.toBeEmptyElement();

      await act(async () => {
        // Create a new Barq object using the existing Barq instance provider.
        await pressButton("with-barq-action");
        expect(existingBarqInstance.objects(dogSchema.name).length).toEqual(1);
        expect(withBarqInstanceBarq.objects(dogSchema.name).length).toEqual(1);
        expect(withBarqInstanceBarq.objects(dogSchema.name)[0]).toStrictEqual(
          existingBarqInstance.objects(dogSchema.name)[0],
        );

        expect(withConfigBarq.objects(dogSchema.name).length).toEqual(0);

        // Create a new Barq object using the Barq config provider.
        await pressButton("with-config-action");
        expect(withConfigBarq.objects(dogSchema.name).length).toEqual(1);
        expect(existingBarqInstance.objects(dogSchema.name).length).toEqual(1);
        expect(withBarqInstanceBarq.objects(dogSchema.name).length).toEqual(1);
      });
    });

    it("can have nested generalized providers with config and with barq", async () => {
      const { BarqProvider, useBarq } = createBarqContext();

      const customBarq = new Barq({ schema: [dogSchema], inMemory: true, path: randomBarqPath() });

      const InstanceFirstWrapper = ({ children }: React.PropsWithChildren) => {
        return (
          <BarqProvider schema={[catSchema]} inMemory={true}>
            <BarqProvider barq={customBarq}>{children}</BarqProvider>
          </BarqProvider>
        );
      };

      const { result: instanceResult } = renderHook(() => useBarq(), { wrapper: InstanceFirstWrapper });

      expect(instanceResult.current).toStrictEqual(customBarq);

      const ConfigFirstWrapper = ({ children }: React.PropsWithChildren) => {
        return (
          <>
            <BarqProvider barq={customBarq}>
              <BarqProvider schema={[catSchema]} inMemory={true}>
                {children}
              </BarqProvider>
            </BarqProvider>
          </>
        );
      };
      const { result: configFirstResult } = renderHook(() => useBarq(), { wrapper: ConfigFirstWrapper });

      expect(configFirstResult.current).not.toStrictEqual(customBarq);
      expect(configFirstResult.current.schema.length).toEqual(1);
      expect(configFirstResult.current.schema[0].name).toEqual(catSchema.name);
    });
  });

  describe("mergeBarqConfiguration", () => {
    it("merges two barq configurations", () => {
      const configA: Barq.Configuration = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      const configB: Barq.Configuration = { sync: { user: {} as User, partitionValue: "someValue" } };

      const expectedResult = {
        schema: [catSchema],
        deleteBarqIfMigrationNeeded: true,
        sync: { user: {} as User, partitionValue: "someValue" },
      };

      const result = mergeBarqConfiguration(configA, configB);

      expect(result).toMatchObject(expectedResult);
    });
    it("merge updates to barq configuration", () => {
      let configA: Barq.Configuration = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      let configB: Barq.Configuration = { schema: [dogSchema], deleteBarqIfMigrationNeeded: undefined };

      let expectedResult: Barq.Configuration = {
        schema: [dogSchema],
      };

      expect(mergeBarqConfiguration(configA, configB)).toMatchObject(expectedResult);
      configA = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      configB = { schema: [catSchema, dogSchema], deleteBarqIfMigrationNeeded: false };

      expectedResult = {
        schema: [catSchema, dogSchema],
        deleteBarqIfMigrationNeeded: false,
      };

      expect(mergeBarqConfiguration(configA, configB)).toMatchObject(expectedResult);
    });
  });

  describe("areConfigurationsIdentical", () => {
    it("returns false if changes detected", () => {
      let configA: Barq.Configuration = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      let configB: Barq.Configuration = { sync: { user: {} as User, partitionValue: "someValue" } };

      expect(areConfigurationsIdentical(configA, configB)).toBeFalsy();

      configA = {
        schema: [dogSchema, catSchema],
        sync: { user: {} as User, partitionValue: "otherValue" },
      };
      configB = {
        schema: [dogSchema, catSchema],
        sync: { user: {} as User, partitionValue: "someValue" },
      };

      expect(areConfigurationsIdentical(configA, configB)).toBeFalsy();
      configA = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      configB = {
        schema: [dogSchema, catSchema],
        sync: { user: {} as User, partitionValue: "someValue" },
      };

      expect(areConfigurationsIdentical(configA, configB)).toBeFalsy();

      configA = { schema: [catSchema], deleteBarqIfMigrationNeeded: true, onMigration: () => undefined };
      configB = { schema: [catSchema], deleteBarqIfMigrationNeeded: true, onMigration: () => undefined };

      expect(areConfigurationsIdentical(configA, configB)).toBeFalsy();

      configA = { schema: [dogSchema, catSchema], deleteBarqIfMigrationNeeded: true };
      configB = { schema: [catSchema, dogSchema], deleteBarqIfMigrationNeeded: true };

      expect(areConfigurationsIdentical(configA, configB)).toBeFalsy();
    });

    it("returns true there are no changes ", () => {
      let configA: Barq.Configuration = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };
      let configB: Barq.Configuration = { schema: [catSchema], deleteBarqIfMigrationNeeded: true };

      expect(areConfigurationsIdentical(configA, configB)).toBeTruthy();

      const onMigration = () => undefined;

      configA = { schema: [catSchema], deleteBarqIfMigrationNeeded: true, onMigration };
      configB = { schema: [catSchema], deleteBarqIfMigrationNeeded: true, onMigration };

      expect(areConfigurationsIdentical(configA, configB)).toBeTruthy();
    });
  });
});
