import React, {useState} from 'react';
import {View, Text, StyleSheet, TextInput, Pressable} from 'react-native';
import colors from '../styles/colors';
import {shadows} from '../styles/shadows';
import {buttonStyles} from '../styles/button';

export const LoginScreen: React.FC<{
  onLogIn: (tenantId: string, userId: string, accessToken: string) => void;
}> = ({onLogIn}) => {
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const canLogIn = !!tenantId && !!userId && !!accessToken;

  return (
    <View style={styles.content}>
      <Text style={styles.hint}>
        Barq has no built-in login screen. Paste in the tenant ID, user ID, and
        access token issued by your own identity provider.
      </Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={tenantId}
          onChangeText={setTenantId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Tenant ID"
        />
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="User ID"
        />
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={accessToken}
          onChangeText={setAccessToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Access Token"
        />
      </View>

      <Pressable
        onPress={() => onLogIn(tenantId, userId, accessToken)}
        style={[styles.button, !canLogIn && styles.buttonDisabled]}
        disabled={!canLogIn}>
        <Text style={buttonStyles.text}>Log In</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.darkBlue,
  },

  hint: {
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    fontSize: 14,
    color: colors.white,
  },

  inputContainer: {
    padding: 10,
    alignSelf: 'stretch',
    marginHorizontal: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: colors.gray,
    padding: 10,
    height: 50,
    marginVertical: 8,
    backgroundColor: colors.white,
    borderRadius: 5,
    ...shadows,
  },

  button: {
    ...buttonStyles.button,
    ...shadows,
    marginTop: 16,
  },

  buttonDisabled: {
    opacity: 0.5,
  },
});
