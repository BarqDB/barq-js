import React, {useCallback, useState} from 'react';
import type {AnyUser} from '@barqdb/barq';
import {OpenBarqBehaviorType, OpenBarqTimeOutBehavior} from '@barqdb/barq';
import {Barq, BarqProvider, UserProvider} from '@barqdb/react';
import {SafeAreaView, StyleSheet} from 'react-native';

import {schemas} from './models';
import {LoginScreen} from './components/LoginScreen';
import colors from './styles/colors';
import {AppSync} from './AppSync';
import {SYNC_CONFIG} from '../sync.config';

export const AppWrapperSync: React.FC = () => {
  // Barq has no built-in login screen or account system. `user` is built from
  // a token issued by your own identity provider, then handed to
  // `UserProvider`, which makes it available to `BarqProvider` and `useUser()`.
  const [user, setUser] = useState<AnyUser | null>(null);

  const handleLogIn = useCallback(
    (tenantId: string, userId: string, accessToken: string) => {
      setUser(
        Barq.User.fromToken(tenantId, userId, accessToken, {
          route: SYNC_CONFIG.route,
        }),
      );
    },
    [],
  );

  const handleLogOut = useCallback(() => setUser(null), []);

  return (
    <SafeAreaView style={styles.screen}>
      <UserProvider
        user={user}
        fallback={<LoginScreen onLogIn={handleLogIn} />}>
        <BarqProvider
          schema={schemas}
          sync={{
            flexible: true,
            existingBarqFileBehavior: {
              type: OpenBarqBehaviorType.DownloadBeforeOpen,
              timeOut: 1000,
              timeOutBehavior: OpenBarqTimeOutBehavior.OpenLocalBarq,
            },
          }}>
          <AppSync onLogOut={handleLogOut} />
        </BarqProvider>
      </UserProvider>
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
