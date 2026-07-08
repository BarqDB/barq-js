import React from 'react';
import {View, FlatList, StyleSheet} from 'react-native';
import {Barq} from '@barqdb/react';

import {Task} from '../models/Task';
import {TaskItem} from './TaskItem';

type TaskListProps = {
  tasks: Barq.Results<Task & Barq.Object>;
  onToggleTaskStatus: (task: Task & Barq.Object) => void;
  onDeleteTask: (task: Task & Barq.Object) => void;
};

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onToggleTaskStatus,
  onDeleteTask,
}) => {
  return (
    <View style={styles.listContainer}>
      <FlatList
        data={tasks}
        keyExtractor={task => task._id.toString()}
        renderItem={({item}) => (
          <TaskItem
            task={item}
            onToggleStatus={() => onToggleTaskStatus(item)}
            onDelete={() => onDeleteTask(item)}
            // Don't spread the Barq item as such: {...item}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default TaskList;
