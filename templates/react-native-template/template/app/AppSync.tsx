import React, {useEffect, useState} from 'react';
import {useQuery, useBarq, useUser} from '@barqdb/react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {Task} from './models/Task';
import {TaskManager} from './components/TaskManager';
import {buttonStyles} from './styles/button';
import {shadows} from './styles/shadows';
import colors from './styles/colors';
import {OfflineModeButton} from './components/OfflineModeButton';

export const AppSync: React.FC<{onLogOut: () => void}> = ({onLogOut}) => {
  const barq = useBarq();
  const user = useUser();
  const [showDone, setShowDone] = useState(false);
  const tasks = useQuery(
    Task,
    collection =>
      showDone
        ? collection.sorted('createdAt')
        : collection.filtered('isComplete == false').sorted('createdAt'),
    [showDone],
  );

  useEffect(() => {
    barq.subscriptions.update(mutableSubs => {
      mutableSubs.add(tasks);
    });
  }, [barq, tasks]);

  return (
    <>
      <TaskManager
        tasks={tasks}
        userId={user?.id}
        setShowDone={setShowDone}
        showDone={showDone}
      />
      <Pressable style={styles.authButton} onPress={onLogOut}>
        <Text style={styles.authButtonText}>{`Logout ${user?.id}`}</Text>
      </Pressable>
      <OfflineModeButton />
    </>
  );
};

const styles = StyleSheet.create({
  authButton: {
    ...buttonStyles.button,
    ...shadows,
    backgroundColor: colors.purpleDark,
  },
  authButtonText: {
    ...buttonStyles.text,
  },
});
