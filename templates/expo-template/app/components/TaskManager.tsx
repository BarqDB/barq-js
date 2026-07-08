import React, {useCallback} from 'react';
import {View, StyleSheet, Switch, Text} from 'react-native';

import {Task} from '../models/Task';
import {IntroText} from './IntroText';
import {AddTaskForm} from './AddTaskForm';
import TaskList from './TaskList';

import {useBarq} from '@barq/react';
import {shadows} from '../styles/shadows';

export const TaskManager: React.FC<{
  tasks: Barq.Results<Task & Barq.Object>;
  userId?: string;
  setShowDone: (showDone: boolean) => void;
  showDone: boolean;
}> = ({tasks, userId, setShowDone, showDone}) => {
  const barq = useBarq();

  const handleAddTask = useCallback(
    (description: string): void => {
      if (!description) {
        return;
      }

      // Everything in the function passed to "barq.write" is a transaction and will
      // hence succeed or fail together. A transcation is the smallest unit of transfer
      // in Barq so we want to be mindful of how much we put into one single transaction
      // and split them up if appropriate (more commonly seen server side). Since clients
      // may occasionally be online during short time spans we want to increase the probability
      // of sync participants to successfully sync everything in the transaction, otherwise
      // no changes propagate and the transaction needs to start over when connectivity allows.
      barq.write(() => {
        return barq.create(Task, {
          description,
          userId: userId ?? 'SYNC_DISABLED',
        });
      });
    },
    [barq, userId],
  );

  const handleToggleTaskStatus = useCallback(
    (task: Task & Barq.Object): void => {
      barq.write(() => {
        // Normally when updating a record in a NoSQL or SQL database, we have to type
        // a statement that will later be interpreted and used as instructions for how
        // to update the record. But in BarqDB, the objects are "live" because they are
        // actually referencing the object's location in memory on the device (memory mapping).
        // So rather than typing a statement, we modify the object directly by changing
        // the property values. If the changes adhere to the schema, Barq will accept
        // this new version of the object and wherever this object is being referenced
        // locally will also see the changes "live".
        task.isComplete = !task.isComplete;
      });

      // Alternatively if passing the ID as the argument to handleToggleTaskStatus:
      // barq?.write(() => {
      //   const task = barq?.objectForPrimaryKey('Task', id); // If the ID is passed as an ObjectId
      //   const task = barq?.objectForPrimaryKey('Task', Barq.Types.ObjectId(id));  // If the ID is passed as a string
      //   task.isComplete = !task.isComplete;
      // });
    },
    [barq],
  );

  const handleDeleteTask = useCallback(
    (task: Task & Barq.Object): void => {
      barq.write(() => {
        barq.delete(task);

        // Alternatively if passing the ID as the argument to handleDeleteTask:
        // barq?.delete(barq?.objectForPrimaryKey('Task', id));
      });
    },
    [barq],
  );

  return (
    <>
      <View style={styles.content}>
        <AddTaskForm onSubmit={handleAddTask} />
        {tasks.length === 0 ? (
          <IntroText />
        ) : (
          <TaskList
            tasks={tasks}
            onToggleTaskStatus={handleToggleTaskStatus}
            onDeleteTask={handleDeleteTask}
          />
        )}
      </View>
      <View style={styles.switchPanel}>
        <Text style={styles.switchPanelText}>Show Completed?</Text>
        <Switch value={showDone} onValueChange={() => setShowDone(!showDone)} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  switchPanel: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    marginHorizontal: 10,
    marginBottom: 10,
    ...shadows,
  },
  switchPanelText: {
    flex: 1,
    fontSize: 16,
    padding: 5,
  },
});
