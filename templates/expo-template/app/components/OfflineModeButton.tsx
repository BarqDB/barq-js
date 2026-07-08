import React, {useState} from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';
import {useBarq} from '@barq/react';

export function OfflineModeButton() {
  const barq = useBarq();

  const [pauseSync, togglePauseSync] = useState(false);

  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleText}>Disable Sync</Text>
      <Switch
        onValueChange={() => {
          if (!pauseSync && barq.syncSession?.state === 'active') {
            barq.syncSession.pause();
            togglePauseSync(true);
          } else if (pauseSync && barq.syncSession?.state === 'inactive') {
            barq.syncSession.resume();
            togglePauseSync(false);
          }
        }}
        value={barq.syncSession?.state === 'inactive'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {padding: 12},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  toggleText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
});
