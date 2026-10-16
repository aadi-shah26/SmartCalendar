'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { taskRowFromForm, type TaskForm } from '../../../lib/calendar/forms';
import { workedMinutes } from '../../../lib/calendar/estimates';
import { isPlannable, schedulingKey, taskFromRow } from '../../../lib/calendar/tasks';
import type { Task } from '../../../lib/calendar/types';

const UNDO_WINDOW_MS = 5000;

type Learning = { estimated_minutes?: number; actual_minutes?: number };

/**
 * Writes `row` plus the learning columns, or just `row` on a database that doesn't have those
 * columns yet (supabase/schema.sql adds them), so saving never fails because of them.
 */
async function withLearning<T extends { error: { message: string } | null }>(
  learning: Learning, write: (extra: Learning) => PromiseLike<T>,
): Promise<T> {
  if (Object.keys(learning).length === 0) return write({});
  const result = await write(learning);
  if (result.error && /estimated_minutes|actual_minutes/.test(result.error.message)) return write({});
  return result;
}

/** A plannable task's duration, as its first estimate. */
const estimateOf = (row: { is_fixed_time: boolean; duration_minutes: number }): Learning =>
  !row.is_fixed_time && row.duration_minutes > 0 ? { estimated_minutes: row.duration_minutes } : {};

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
      const task = tasks.find(item => item.id === id);
      // How long it really took, to compare with its estimate.
      const learning: Learning = task?.estimatedMinutes ? { actual_minutes: workedMinutes(task.sessions, Date.now()) } : {};
      setTasks(prev => prev.map(item => item.id === id
        ? { ...item, isCompleted: true, actualMinutes: learning.actual_minutes ?? item.actualMinutes } : item));
      await withLearning(learning, extra => supabase.from('tasks').update({ is_completed: true, ...extra }).eq('id', id));
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
      const before = tasks.find(item => item.id === editingId);
      // A task that only now gets a duration: that's its first estimate.
      const learning = before?.estimatedMinutes ? {} : estimateOf(row);
      const { data, error } = await withLearning(learning, extra => supabase.from('tasks').update({ ...row, ...extra }).eq('id', editingId).select());
      if (error || !data) return error?.message ?? 'Failed to update task.';
      const updated = taskFromRow(data[0]);
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
    const { data, error } = await withLearning(estimateOf(row),
      extra => supabase.from('tasks').insert([{ ...row, ...extra, user_id: session.user.id }]).select());
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
