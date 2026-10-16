'use client';
import type { CSSProperties } from 'react';
import { Sparkles, Timer } from 'lucide-react';
import { getTextColor } from '../../lib/calendar/colors';
import { shiftEndWithStart, type EventForm, type ItemTab, type TaskForm } from '../../lib/calendar/forms';
import type { EnergyLevel, RecurrenceType, TaskPriority } from '../../lib/calendar/types';
import ColorPicker from './ColorPicker';
import DateTimeField from './DateTimeField';
import ModalShell from './ModalShell';
import TimePicker from './TimePicker';
import { cancelBtnStyle, deleteBtnStyle, errorTextStyle, focusBtnStyle, inputStyle, labelStyle, saveBtnStyle, twoColumns } from './styles';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const headingStyle: CSSProperties = { margin: '0 0 16px', fontWeight: 800, fontSize: 18 };
const checkboxRow: CSSProperties = { marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 };
const checkboxLabel: CSSProperties = { fontSize: 13, color: '#444', cursor: 'pointer' };

/** A number input whose empty state is '' rather than 0. */
const numberOrEmpty = (v: string): number | '' => (v === '' ? '' : Number(v));

function Buttons({ accentColor, onDelete, onCancel, onSave, saveLabel, marginTop }: {
  accentColor: string; onDelete?: () => void; onCancel: () => void; onSave: () => void; saveLabel: string; marginTop: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop }}>
      {onDelete && <button onClick={onDelete} style={deleteBtnStyle}>Delete</button>}
      <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
      <button onClick={onSave} style={{ ...saveBtnStyle, backgroundColor: accentColor, color: getTextColor(accentColor) }}>{saveLabel}</button>
    </div>
  );
}

function TaskFields({ form, onChange }: { form: TaskForm; onChange: (patch: Partial<TaskForm>) => void }) {
  return (
    <>
      <label style={labelStyle}>Title *</label>
      <input value={form.title} onChange={e => onChange({ title: e.target.value })} placeholder="e.g. Prepare presentation" style={inputStyle} autoFocus />

      <label style={labelStyle}>Description</label>
      <textarea value={form.description} onChange={e => onChange({ description: e.target.value })} placeholder="Optional details..." rows={3} style={{ ...inputStyle, resize: 'none' }} />

      <div style={twoColumns}>
        <div>
          <label style={labelStyle}>Duration (minutes)</label>
          <input type="number" min={0} value={form.duration} onChange={e => onChange({ duration: numberOrEmpty(e.target.value) })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <select value={form.priority} onChange={e => onChange({ priority: e.target.value as TaskPriority })} style={inputStyle}>
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
        </div>
      </div>

      <div style={twoColumns}>
        <div>
          <label style={labelStyle}>Energy Level</label>
          <select value={form.energyLevel} onChange={e => onChange({ energyLevel: e.target.value as EnergyLevel })} style={inputStyle}>
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Deadline</label>
          <DateTimeField value={form.deadline} onChange={deadline => onChange({ deadline })} defaultTime="23:59" />
        </div>
      </div>

      <label style={labelStyle}>Color</label>
      <ColorPicker value={form.color} onChange={color => onChange({ color })} />

      <div style={checkboxRow}>
        <input type="checkbox" id="fixedTime" checked={form.isFixedTime} onChange={e => onChange({ isFixedTime: e.target.checked })} style={{ width: 16, height: 16 }} />
        <label htmlFor="fixedTime" style={checkboxLabel}>Fixed start/end (use exact times)</label>
      </div>

      {form.isFixedTime && (
        <div style={{ ...twoColumns, marginTop: 4 }}>
          <div>
            <label style={labelStyle}>Start</label>
            <DateTimeField value={form.fixedStart} onChange={fixedStart => onChange({ fixedStart })} defaultTime="09:00" />
          </div>
          <div>
            <label style={labelStyle}>End</label>
            <DateTimeField value={form.fixedEnd} onChange={fixedEnd => onChange({ fixedEnd })} defaultTime="10:00" />
          </div>
        </div>
      )}

      <div style={checkboxRow}>
        <input type="checkbox" id="splittable" checked={form.isSplittable} onChange={e => onChange({ isSplittable: e.target.checked })} style={{ width: 16, height: 16 }} />
        <label htmlFor="splittable" style={checkboxLabel}>Allow splitting into chunks</label>
      </div>

      {form.isSplittable && (
        <div style={{ ...twoColumns, marginTop: 4 }}>
          <div>
            <label style={labelStyle}>Chunk min (minutes)</label>
            <input type="number" min={1} value={form.chunkMin} onChange={e => onChange({ chunkMin: numberOrEmpty(e.target.value) })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Chunk max (minutes)</label>
            <input type="number" min={1} value={form.chunkMax} onChange={e => onChange({ chunkMax: numberOrEmpty(e.target.value) })} style={inputStyle} />
          </div>
        </div>
      )}
    </>
  );
}

function EventFields({ form, onChange, accentColor }: {
  form: EventForm; onChange: (patch: Partial<EventForm>) => void; accentColor: string;
}) {
  const toggleDay = (i: number) => onChange({
    recurrenceDays: form.recurrenceDays.includes(i) ? form.recurrenceDays.filter(d => d !== i) : [...form.recurrenceDays, i],
  });
  return (
    <>
      <label style={labelStyle}>Title *</label>
      <input value={form.title} onChange={e => onChange({ title: e.target.value })} placeholder="Event title" style={inputStyle} autoFocus />
      <label style={labelStyle}>Date</label>
      <input type="date" value={form.date} onChange={e => onChange({ date: e.target.value })} style={inputStyle} />
      <div style={twoColumns}>
        <div>
          <label style={labelStyle}>Start Time</label>
          <TimePicker value={form.start} onChange={start => onChange({ start, end: shiftEndWithStart(form.start, form.end, start) })} />
        </div>
        <div>
          <label style={labelStyle}>End Time</label>
          <TimePicker value={form.end} onChange={end => onChange({ end })} after={form.start} />
        </div>
      </div>
      <label style={labelStyle}>Description</label>
      <textarea value={form.description} onChange={e => onChange({ description: e.target.value })} placeholder="Optional notes..." style={{ ...inputStyle, height: 60, resize: 'none' }} />

      <label style={labelStyle}>Color</label>
      <ColorPicker value={form.color} onChange={color => onChange({ color })} />

      <label style={labelStyle}>Repeat</label>
      <select value={form.recurrenceType} onChange={e => onChange({ recurrenceType: e.target.value as RecurrenceType })} style={inputStyle}>
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly on selected days</option>
      </select>
      {form.recurrenceType === 'weekly' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {WEEKDAYS.map((day, i) => {
            const on = form.recurrenceDays.includes(i);
            return (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid',
                  backgroundColor: on ? accentColor : 'transparent',
                  borderColor: on ? accentColor : '#e0e0e0',
                  color: on ? getTextColor(accentColor) : '#666',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {day}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The add/edit modal, with a Task tab and an Event tab. */
export default function ItemModal({
  tab, onTabChange, accentColor, error, isEditingTask, isEditingEvent,
  taskForm, onTaskChange, eventForm, onEventChange,
  onClose, onSaveTask, onDeleteTask, onSaveEvent, onDeleteEvent, onStartFocus, onBreakdown,
}: {
  tab: ItemTab; onTabChange: (tab: ItemTab) => void; accentColor: string; error: string | null;
  isEditingTask: boolean; isEditingEvent: boolean;
  taskForm: TaskForm; onTaskChange: (patch: Partial<TaskForm>) => void;
  eventForm: EventForm; onEventChange: (patch: Partial<EventForm>) => void;
  onClose: () => void; onSaveTask: () => void; onDeleteTask: () => void;
  onSaveEvent: () => void; onDeleteEvent: () => void;
  /** Opens the focus timer for the task being edited. */
  onStartFocus?: () => void;
  /** Opens "Break into steps" for the task being edited. */
  onBreakdown?: () => void;
}) {
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '10px 20px', border: 'none', background: 'none', fontWeight: 700, fontSize: 14,
    color: active ? accentColor : '#999',
    borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent',
    cursor: 'pointer', marginBottom: -2,
  });
  return (
    <ModalShell onClose={onClose} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0', marginBottom: 20 }}>
        <button style={tabStyle(tab === 'task')} onClick={() => onTabChange('task')}>Task</button>
        <button style={tabStyle(tab === 'event')} onClick={() => onTabChange('event')}>Event</button>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', alignSelf: 'center', padding: '0 4px' }}>×</button>
      </div>

      {tab === 'task' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <h2 style={{ ...headingStyle, margin: 0 }}>{isEditingTask ? 'Edit Task' : 'New Task'}</h2>
            {isEditingTask && (
              <div style={{ display: 'flex', gap: 6 }}>
                {onBreakdown && (
                  <button type="button" onClick={onBreakdown} title="Let AI split this task into smaller steps"
                    style={{ ...focusBtnStyle, background: '#fff', color: '#1a1a1a', border: '1px solid #e0e0e0', boxShadow: 'none' }}>
                    <Sparkles style={{ width: 14, height: 14 }} /> Break into steps
                  </button>
                )}
                {onStartFocus && (
                  <button type="button" onClick={onStartFocus} style={focusBtnStyle}>
                    <Timer style={{ width: 15, height: 15 }} /> Start focus timer
                  </button>
                )}
              </div>
            )}
          </div>
          <TaskFields form={taskForm} onChange={onTaskChange} />
          {error && <div style={errorTextStyle}>{error}</div>}
          <Buttons accentColor={accentColor} marginTop={20} onCancel={onClose}
            onDelete={isEditingTask ? onDeleteTask : undefined}
            onSave={onSaveTask} saveLabel={isEditingTask ? 'Save Changes' : 'Create Task'} />
        </>
      ) : (
        <>
          <h2 style={headingStyle}>{isEditingEvent ? 'Edit Event' : 'New Event'}</h2>
          <EventFields form={eventForm} onChange={onEventChange} accentColor={accentColor} />
          {error && <div style={errorTextStyle}>{error}</div>}
          <Buttons accentColor={accentColor} marginTop={16} onCancel={onClose}
            onDelete={isEditingEvent ? onDeleteEvent : undefined}
            onSave={onSaveEvent} saveLabel={isEditingEvent ? 'Save Changes' : 'Save Event'} />
        </>
      )}
    </ModalShell>
  );
}
