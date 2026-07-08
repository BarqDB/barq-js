import React from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';

import colors from './styles/colors';
import {AppNonSync} from './AppNonSync';

import {BarqProvider} from '@barq/react';
import {schemas} from './models';

export const AppWrapperNonSync = () => {
  // If sync is disabled, setup the app without any sync functionality and return early
  return (
    <SafeAreaView style={styles.screen}>
      <BarqProvider schema={schemas}>
        <AppNonSync />
      </BarqProvider>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.darkBlue,
  },
});
