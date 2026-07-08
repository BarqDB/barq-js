////////////////////////////////////////////////////////////////////////////
//
// Copyright 2021 Realm Inc.
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

import React, { useContext, useEffect, useRef, useState } from "react";
import Barq from "@barq/barq";
import isEqual from "lodash.isequal";

import { UserContext } from "./UserProvider";
import { RestrictivePick } from "./helpers";

type PartialBarqConfiguration = Omit<Partial<Barq.Configuration>, "sync"> & {
  sync?: Partial<Barq.SyncConfiguration>;
};

export type BarqProviderFallback = React.ComponentType<{
  progress: number;
}>;

/** Props used for a configuration-based Barq provider */
type BarqProviderConfigurationProps = {
  /**
   * If false, Barq will not be closed when the component unmounts.
   * @default true
   */
  closeOnUnmount?: boolean;
  /**
   * A ref to the Barq instance. This is useful if you need to access the Barq
   * instance outside of a component that uses the Barq hooks.
   */
  realmRef?: React.MutableRefObject<Barq | null>;
  /**
   * The fallback component to render if the Barq is not open.
   */
  fallback?: BarqProviderFallback | React.ComponentType | React.ReactElement | null | undefined;
  children: React.ReactNode;
} & PartialBarqConfiguration;

/** Props used for a Barq instance-based Barq provider */
type BarqProviderBarqProps = {
  /**
   * The Barq instance to be used by the provider.
   */
  realm: Barq;
  children: React.ReactNode;
};

type BarqProviderProps = BarqProviderConfigurationProps & BarqProviderBarqProps;

/**
 * Represents the provider returned from `createBarqContext` with a Barq instance  i.e. `createBarqContext(new Barq(...))`.
 * Omits "realm" as it gets set at creation and cannot be changed.
 
 * **Note:** the hooks returned from `createBarqContext` using an existing Barq can be used outside of the scope of the provider.
 */
export type BarqProviderFromBarq = React.FC<Omit<BarqProviderBarqProps, "realm">>;

/**
 * Represents the provider returned from `createBarqContext` with a configuration, i.e. `createBarqContext({schema: [...]})`.
 */
export type BarqProviderFromConfiguration = React.FC<BarqProviderConfigurationProps>;

/**
 * Represents properties of a {@link DynamicBarqProvider} where Barq instance props are set and Configuration props are disallowed.
 */
export type DynamicBarqProviderWithBarqProps = RestrictivePick<BarqProviderProps, keyof BarqProviderBarqProps>;

/**
 * Represents properties of a {@link DynamicBarqProvider} where Barq configuration props are set and Barq instance props are disallowed.
 */
export type DynamicBarqProviderWithConfigurationProps = RestrictivePick<
  BarqProviderProps,
  keyof BarqProviderConfigurationProps
>;

/**
 * Represents the provider returned from creating context with no arguments (including the default context).
 * Supports either {@link BarqProviderBarqProps} or {@link BarqProviderConfigurationProps}.
 */
export type DynamicBarqProvider = React.FC<
  DynamicBarqProviderWithBarqProps | DynamicBarqProviderWithConfigurationProps
>;

export function createBarqProviderFromBarq(
  realm: Barq,
  BarqContext: React.Context<Barq | null>,
): BarqProviderFromBarq {
  return ({ children }) => {
    return <BarqContext.Provider value={realm} children={children} />;
  };
}

/**
 * Generates a `BarqProvider` given a {@link Barq.Configuration} and {@link React.Context}.
 * @param realmConfig - The configuration of the Barq to be instantiated
 * @param BarqContext - The context that will contain the Barq instance
 * @returns a BarqProvider component that provides context to all context hooks
 */
export function createBarqProviderFromConfig(
  realmConfig: Barq.Configuration,
  BarqContext: React.Context<Barq | null>,
): BarqProviderFromConfiguration {
  return ({ children, fallback: Fallback, closeOnUnmount = true, realmRef, ...restProps }) => {
    const [realm, setBarq] = useState<Barq | null>(() =>
      realmConfig.sync === undefined && restProps.sync === undefined
        ? new Barq(mergeBarqConfiguration(realmConfig, restProps))
        : null,
    );

    // Automatically set the user in the configuration if its been set.
    // Grabbing directly from the context to avoid throwing an error if the user is not set.
    const user = useContext(UserContext);

    // We increment `configVersion` when a config override passed as a prop
    // changes, which triggers a `useEffect` to re-open the Barq with the
    // new config
    const [configVersion, setConfigVersion] = useState(0);

    // We put realm in a ref to avoid have an endless loop of updates when the realm is updated
    const currentBarq = useRef(realm);

    // This will merge the configuration provided by createBarqContext and any configuration properties
    // set directly on the BarqProvider component.  Any settings on the component will override the original configuration.
    const configuration = useRef<Barq.Configuration>(mergeBarqConfiguration(realmConfig, restProps));

    // Merge and set the configuration again and increment the version if any
    // of the BarqProvider properties change.
    useEffect(() => {
      const combinedConfig = mergeBarqConfiguration(realmConfig, restProps);

      // If there is a user in the current context and not one set by the props, then use the one from context
      const combinedConfigWithUser =
        combinedConfig?.sync && user ? mergeBarqConfiguration({ sync: { user } }, combinedConfig) : combinedConfig;

      if (!areConfigurationsIdentical(configuration.current, combinedConfigWithUser)) {
        configuration.current = combinedConfigWithUser;
        // Only rerender if realm has already been configured
        if (currentBarq.current != null) {
          setConfigVersion((x) => x + 1);
        }
      }
    }, [restProps, user]);

    useEffect(() => {
      currentBarq.current = realm;
      if (realmRef) {
        realmRef.current = realm;
      }
    }, [realm]);

    const [progress, setProgress] = useState<number>(0);

    useEffect(() => {
      const realmRef = currentBarq.current;
      // Check if we currently have an open Barq. If we do not (i.e. it is the first
      // render, or the Barq has been closed due to a config change), then we
      // need to open a new Barq.
      const shouldInitBarq = realmRef === null;
      const initBarq = async () => {
        const openBarq = await Barq.open(configuration.current).progress((estimate: number) => {
          setProgress(estimate);
        });
        setBarq(openBarq);
      };
      if (shouldInitBarq) {
        initBarq().catch(console.error);
      }

      return () => {
        if (realm) {
          if (closeOnUnmount) {
            realm.close();
          }
          setBarq(null);
        }
      };
    }, [configVersion, realm, setBarq, closeOnUnmount]);

    if (!realm) {
      if (typeof Fallback === "function") {
        return <Fallback progress={progress} />;
      }
      return <>{Fallback}</>;
    }

    return <BarqContext.Provider value={realm} children={children} />;
  };
}

/**
 * Generates a `BarqProvider` which is either based on a configuration
 * or based on a realm, depending on its props.
 * @param BarqContext - The context that will contain the Barq instance
 * @returns a BarqProvider component that provides context to all context hooks
 */
export function createDynamicBarqProvider(BarqContext: React.Context<Barq | null>): DynamicBarqProvider {
  const BarqProviderFromConfig = createBarqProviderFromConfig({}, BarqContext);
  return ({ realm, children, ...config }) => {
    if (realm) {
      if (Object.keys(config).length > 0) {
        throw new Error("Cannot use configuration props when using an existing Barq instance.");
      }
      return <BarqContext.Provider value={realm} children={children} />;
    } else {
      return <BarqProviderFromConfig {...config} children={children} />;
    }
  };
}

/**
 * Generates the appropriate `BarqProvider` based on whether there is a config, realm, or neither given.
 * @param realmOrConfig - A Barq instance, a configuration, or undefined (including default provider).
 * @param BarqContext - The context that will contain the Barq instance
 * @returns a BarqProvider component that provides context to all context hooks
 */
export function createBarqProvider(
  realmOrConfig: Barq.Configuration | Barq | undefined,
  BarqContext: React.Context<Barq | null>,
): BarqProviderFromConfiguration | BarqProviderFromBarq | DynamicBarqProvider {
  if (!realmOrConfig) {
    return createDynamicBarqProvider(BarqContext);
  } else if (realmOrConfig instanceof Barq) {
    return createBarqProviderFromBarq(realmOrConfig, BarqContext);
  } else {
    return createBarqProviderFromConfig(realmOrConfig, BarqContext);
  }
}

/**
 * Merge two configurations, creating a configuration using `configA` as the default,
 * merged with `configB`, with properties in `configB` overriding `configA`.
 * @param configA - The default config object
 * @param configB - Config overrides object
 * @returns Merged config object
 */
export function mergeBarqConfiguration(
  configA: PartialBarqConfiguration,
  configB: PartialBarqConfiguration,
): Barq.Configuration {
  // In order to granularly update sync properties on the BarqProvider, sync must be
  // seperately applied to the configuration.  This allows for dynamic updates to the
  // partition field.
  const sync = { ...configA.sync, ...configB.sync };

  return {
    ...configA,
    ...configB,
    //TODO: When Barq >= 10.9.0 is a peer dependency, we can simply spread sync here
    //See issue #4012
    ...(Object.keys(sync).length > 0 ? { sync } : undefined),
  } as Barq.Configuration;
}

/**
 * Utility function that does a deep comparison (key: value) of object a with object b
 * @param a - Object to compare
 * @param b - Object to compare
 * @returns True if the objects are identical
 */
export function areConfigurationsIdentical(a: Barq.Configuration, b: Barq.Configuration): boolean {
  return isEqual(a, b);
}
