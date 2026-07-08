import React from 'react';
import {AppProvider, UserProvider} from '@barqdb/react';
import {SafeAreaView, StyleSheet} from 'react-native';

import {schemas} from './models';
import {LoginScreen} from './components/LoginScreen';
import colors from './styles/colors';
import {AppSync} from './AppSync';

import {BarqProvider} from '@barqdb/react';
import {OpenBarqBehaviorType, OpenBarqTimeOutBehavior} from '@barqdb/barq';

export const AppWrapperSync: React.FC<{
  appId: string;
}> = ({appId}) => {
  // If we are logged in, add the sync configuration the the BarqProvider and render the app
  return (
    <SafeAreaView style={styles.screen}>
      <AppProvider id={appId}>
        <UserProvider fallback={<LoginScreen />}>
          <BarqProvider
            schema={schemas}
            sync={{
              flexible: true,
              existingBarqFileBehavior: {
                type: OpenBarqBehaviorType.DownloadBeforeOpen,
                timeOut: 1000,
                timeOutBehavior:
                  // In v11 the enums are not set up correctly, so we need to use the string values
                  OpenBarqTimeOutBehavior?.OpenLocalBarq ?? 'openLocalBarq',
              },
            }}>
            <AppSync />
          </BarqProvider>
        </UserProvider>
      </AppProvider>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.darkBlue,
  },
});

export default AppWrapperSync;
