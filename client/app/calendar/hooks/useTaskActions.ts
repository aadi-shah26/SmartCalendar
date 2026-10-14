'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { taskRowFromForm, type TaskForm } from '../../../lib/calendar/forms';
import { isPlannable, schedulingKey, taskFromRow } from '../../../lib/calendar/tasks';
import type { Task } from '../../../lib/calendar/types';

const UNDO_WINDOW_MS = 5000;

/** Creating, editing, completing and deleting (with undo) tasks. */
export function useTaskActions({ tasks, setTasks, userId, replanTask }: {
  tasks: Task[]; setTasks: Dispatch<SetStateAction<Task[]>>; userId: string | null;
  replanTask: (taskList: Task[], id: string) => Promise<void>;
}) {
  const [createdMessage, setCreatedMessage] = useState<string | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ id: string; timer?: number } | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Hidden right away; removed for good once the undo window passes.
  function deleteTask(id: string) {
    setTasks(prev => prev.map(item => item.id === id ? { ...item, isDeleted: true } : item));
    const timer = window.setTimeout(async () => {
      setTasks(prev => prev.filter(item => item.id !== id));
      setUndoInfo(null);
      await supabase.from('tasks').delete().eq('id', id);
    }, UNDO_WINDOW_MS);
    setUndoInfo({ id, timer });
  }

  function undoDelete() {
    if (!undoInfo) return;
    const { id, timer } = undoInfo;
    if (timer) window.clearTimeout(timer);
    setTasks(prev => prev.map(item => item.id === id ? { ...item, isDeleted: false } : item));
    setUndoInfo(null);
  }

  function completeTask(id: string) {
    setCompletingTaskId(id);
    // Let the check-off animation play first.
    setTimeout(async () => {
      setCompletingTaskId(null);
      // setTasks alone is enough — the sync effect removes its calendar block automatically.
      setTasks(prev => prev.map(item => item.id === id ? { ...item, isCompleted: true } : item));
      await supabase.from('tasks').update({ is_completed: true }).eq('id', id);
    }, 500);
  }

  /**
   * Saves the task form: updates `editingId`, or creates a task when it's null. Calls `onSaved`
   * as soon as the task is stored, then re-plans it if needed. Resolves to an error message,
   * or null on success.
   */
  async function saveTask(form: TaskForm, editingId: string | null, onSaved: () => void): Promise<string | null> {
    if (!form.title.trim()) return 'Title is required.';
    if (!userId) return 'Not signed in.';
    const row = taskRowFromForm(form);
    if (editingId) {
      const { data, error } = await supabase.from('tasks').update(row).eq('id', editingId).select();
      if (error || !data) return error?.message ?? 'Failed to update task.';
      const updated = taskFromRow(data[0]);
      const before = tasks.find(item => item.id === editingId);
      const nextTasks = tasks.map(item => item.id === editingId ? updated : item);
      setTasks(nextTasks);
      onSaved();
      if (schedulingKey(before) !== schedulingKey(updated)) await replanTask(nextTasks, String(updated.id));
      return null;
    }
    // Fetch the session fresh rather than trusting the cached userId state, which can go
    // stale (e.g. session changed in another tab) and get rejected by row-level security.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Not signed in.';
    const { data, error } = await supabase.from('tasks').insert([{ ...row, user_id: session.user.id }]).select();
    if (error || !data) return error?.message ?? 'Failed to save task.';
    const newTask = taskFromRow(data[0]);
    const nextTasks = [newTask, ...tasks];
    setTasks(nextTasks);
    setCreatedMessage(`Saved "${newTask.title}"`);
    setTimeout(() => setCreatedMessage(null), 2500);
    onSaved();
    if (isPlannable(newTask)) await replanTask(nextTasks, String(newTask.id));
    return null;
  }

  return { saveTask, deleteTask, undoDelete, completeTask, createdMessage, completingTaskId, hasUndo: undoInfo !== null };
}
