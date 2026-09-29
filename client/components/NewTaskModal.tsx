"use client";

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, X } from 'lucide-react';

type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type EnergyLevel = 'Low' | 'Medium' | 'High';

interface TaskState {
  title: string;
  description: string;
  duration: number | '';
  priority: Priority;
  energyLevel: EnergyLevel;
  deadline: string | null;
  isFixedTime: boolean;
  fixedStart: string | null;
  fixedEnd: string | null;
  isSplittable: boolean;
  chunkSizeMin: number | '';
  chunkSizeMax: number | '';
}

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  // called with the created task payload before closing
  onCreate?: (task: Record<string, any>) => void;
}

export default function NewTaskModal({ isOpen, onClose, onCreate }: NewTaskModalProps) {
  const getInitial = (): TaskState => ({
    title: '',
    description: '',
    duration: '',
    priority: 'Medium',
    energyLevel: 'Medium',
    deadline: null,
    isFixedTime: false,
    fixedStart: null,
    fixedEnd: null,
    isSplittable: false,
    chunkSizeMin: '',
    chunkSizeMax: '',
  });

  const [task, setTask] = useState<TaskState>(getInitial);

  // reset form whenever modal opens
  useEffect(() => {
    if (isOpen) setTask(getInitial());
  }, [isOpen]);

  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function update<K extends keyof TaskState>(key: K, value: TaskState[K]) {
    setTask(prev => ({ ...prev, [key]: value }));
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!task.title.trim()) {
      setError('Title is required.');
      return;
    }

    const parsed = {
      title: task.title.trim(),
      description: task.description.trim(),
      duration: Number(task.duration) || 0,
      priority: task.priority,
      energyLevel: task.energyLevel,
      // send a serializable ISO string for persistence
      deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      isFixedTime: Boolean(task.isFixedTime),
      fixedStart: task.fixedStart ? new Date(task.fixedStart).toISOString() : null,
      fixedEnd: task.fixedEnd ? new Date(task.fixedEnd).toISOString() : null,
      // compute durationMinutes from fixed times if provided
      durationMinutes: task.isFixedTime && task.fixedStart && task.fixedEnd
        ? Math.max(0, Math.round((new Date(task.fixedEnd).getTime() - new Date(task.fixedStart).getTime()) / 60000))
        : (Number(task.duration) || 0),
      isSplittable: Boolean(task.isSplittable),
      chunkSize:
        task.isSplittable
          ? {
              min: Number(task.chunkSizeMin) || 0,
              max: Number(task.chunkSizeMax) || 0,
            }
          : null,
      createdAt: new Date().toISOString(),
    };

    // simulate upload per GitHub Issue #7
    console.log(JSON.stringify(parsed, null, 2));

  // call onCreate so parent can store the task (UI / calendar)
  if (typeof onCreate === 'function') onCreate(parsed);

  onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Create new task"
    >
      {/* Backdrop (glass) */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 to-black/20 shadow-2xl backdrop-filter backdrop-saturate-150 p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/8 p-2">
              <Calendar className="h-5 w-5 text-white/90" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">New Task</h3>
              <p className="text-sm text-white/70">Create a task for your calendar</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-white/80 hover:bg-white/6"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="mt-6 grid grid-cols-1 gap-4" onSubmit={handleSubmit}>
          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/90">Title *</label>
            <input
              className="w-full rounded-lg bg-white/6 px-3 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={task.title}
              onChange={e => update('title', e.target.value)}
              placeholder="e.g. Prepare presentation"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/90">Description</label>
            <textarea
              className="w-full rounded-lg bg-white/6 px-3 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              rows={3}
              value={task.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Optional details..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Duration */}
            <div>
              <label className="mb-1 block text-sm font-medium text-white/90">Duration (minutes)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                  value={task.duration}
                  onChange={e => update('duration', e.target.value === '' ? '' : Number(e.target.value))}
                />
                <span className="text-sm text-white/60">min</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Priority */}
            <div>
              <label className="mb-1 block text-sm font-medium text-white/90">Priority</label>
              <select
                className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                value={task.priority}
                onChange={e => update('priority', e.target.value as Priority)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>

            {/* Energy */}
            <div>
              <label className="mb-1 block text-sm font-medium text-white/90">Energy Level</label>
              <select
                className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                value={task.energyLevel}
                onChange={e => update('energyLevel', e.target.value as EnergyLevel)}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>

            {/* Deadline */}
            <div>
              <label className="mb-1 block text-sm font-medium text-white/90">Deadline</label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                  value={task.deadline ?? ''}
                  onChange={e => update('deadline', e.target.value || null)}
                />
                <Clock className="h-5 w-5 text-white/70" />
              </div>
            </div>
            {/* Fixed time toggle */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-white/6 text-indigo-500 focus:ring-indigo-400"
                  checked={task.isFixedTime}
                  onChange={e => update('isFixedTime', e.target.checked)}
                />
                <span className="text-sm text-white/90">Fixed start/end (use exact times)</span>
              </label>
            </div>

            {task.isFixedTime && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-white/90">Start</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                    value={task.fixedStart ?? ''}
                    onChange={e => update('fixedStart', e.target.value || null)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-white/90">End</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                    value={task.fixedEnd ?? ''}
                    onChange={e => update('fixedEnd', e.target.value || null)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Splittable */}
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-white/6 text-indigo-500 focus:ring-indigo-400"
                checked={task.isSplittable}
                onChange={e => update('isSplittable', e.target.checked)}
              />
              <span className="text-sm text-white/90">Allow splitting into chunks</span>
            </label>
          </div>

          {task.isSplittable && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-white/90">Chunk min (minutes)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                  value={task.chunkSizeMin}
                  onChange={e => update('chunkSizeMin', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-white/90">Chunk max (minutes)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg bg-white/6 px-3 py-2 text-white focus:outline-none"
                  value={task.chunkSizeMax}
                  onChange={e => update('chunkSizeMax', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {error && <div className="text-sm text-rose-400">{error}</div>}

          {/* Actions */}
          <div className="mt-2 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="order-2 rounded-md border border-white/8 bg-transparent px-4 py-2 text-sm text-white/90 hover:bg-white/6 sm:order-1"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="order-1 rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 sm:order-2"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
