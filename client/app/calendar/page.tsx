'use client';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_WORK_PLAN } from '../../lib/scheduler';
import type { ParsedItem } from '../../lib/nlp/parse';
import { getTextColor } from '../../lib/calendar/colors';
import { timeOfDay } from '../../lib/calendar/dates';
import { blockMinutes, localMs } from '../../lib/calendar/drag';
import { expandEvents, isTaskEventId, taskIdFromCalendarId } from '../../lib/calendar/events';
import { eventFormFromEvent } from '../../lib/calendar/forms';
import { pendingCheckIns } from '../../lib/calendar/tasks';
import type { CalendarEvent, ViewMode } from '../../lib/calendar/types';
import WorkPlanModal from '../../components/WorkPlanModal';
import { DateNavigator, ViewSwitcher } from '../../components/calendar/CalendarToolbar';
import DayView from '../../components/calendar/DayView';
import ItemModal from '../../components/calendar/ItemModal';
import MonthView from '../../components/calendar/MonthView';
import ProfileMenu from '../../components/calendar/ProfileMenu';
import ProfileModal from '../../components/calendar/ProfileModal';
import QuickAddBar from '../../components/calendar/QuickAddBar';
import SessionModal from '../../components/calendar/SessionModal';
import TaskSidebar from '../../components/calendar/TaskSidebar';
import type { MoveBlock } from '../../components/calendar/TimedEvents';
import WeekView from '../../components/calendar/WeekView';
import YearView from '../../components/calendar/YearView';
import { useCalendarData } from './hooks/useCalendarData';
import { useEventActions } from './hooks/useEventActions';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useItemModal } from './hooks/useItemModal';
import { usePlanner } from './hooks/usePlanner';
import { useTaskActions } from './hooks/useTaskActions';

export default function CalendarPage() {
  const data = useCalendarData();
  const { accentColor, events, tasks } = data;
  const google = useGoogleCalendar(data.reloadEvents);
  const planner = usePlanner({
    events, tasks, setTasks: data.setTasks, profile: data.profile, userId: data.userId,
    workPlan: data.workPlan, setWorkPlan: data.setWorkPlan,
  });
  const taskActions = useTaskActions({ tasks, setTasks: data.setTasks, userId: data.userId, replanTask: planner.replanTask });
  const eventActions = useEventActions({ events: data.storedEvents, setEvents: data.setStoredEvents, mirror: google.mirror });
  const modal = useItemModal(accentColor);

  const [view, setView] = useState<ViewMode>('Week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showProfile, setShowProfile] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  useEffect(() => {
    if (!moveError) return;
    const id = window.setTimeout(() => setMoveError(null), 5000);
    return () => window.clearTimeout(id);
  }, [moveError]);
  // The open work session, found by its times: a replan can reorder a task's sessions.
  const [openSession, setOpenSession] = useState<{ taskId: string; start: string; end: string; openedAt: number } | null>(null);
  const sessionTask = openSession ? tasks.find(t => String(t.id) === openSession.taskId) : undefined;
  const session = openSession ? sessionTask?.sessions?.find(s => s.start === openSession.start && s.end === openSession.end) : undefined;
  const showSession = (taskId: string, index: number) => {
    const row = tasks.find(t => String(t.id) === taskId)?.sessions?.[index];
    if (row) setOpenSession({ taskId, start: row.start, end: row.end, openedAt: Date.now() });
  };
  const checkIns = useMemo(() => pendingCheckIns(tasks, planner.nowMs), [tasks, planner.nowMs]);

  // Recurring events repeated across a window around the date on screen.
  const displayEvents = useMemo(() => {
    const wStart = new Date(currentDate); wStart.setDate(wStart.getDate() - 14);
    const wEnd = new Date(currentDate); wEnd.setDate(wEnd.getDate() + 90);
    return expandEvents(events, wStart, wEnd);
  }, [events, currentDate]);

  // Clicking a block edits the event, opens the work session, or edits the task it came from.
  const openDetail = (ev: CalendarEvent) => {
    if (!isTaskEventId(ev.id)) return modal.openEvent(ev);
    if (ev.isTaskSession && ev.sessionIndex !== undefined) return showSession(taskIdFromCalendarId(ev.id), ev.sessionIndex);
    const task = tasks.find(t => String(t.id) === taskIdFromCalendarId(ev.id));
    if (task) modal.openTask(task);
  };

  // Quick add opens the matching form, prefilled, for the user to review and save.
  const reviewParsed = (item: ParsedItem) => {
    modal.openNew(item.kind);
    if (item.kind === 'event') {
      modal.patchEventForm({
        title: item.title, description: item.description, date: item.date, start: item.startTime, end: item.endTime,
        recurrenceType: item.recurrence.type, recurrenceDays: item.recurrence.days,
      });
      setCurrentDate(new Date(`${item.date}T00:00:00`));
    } else {
      modal.patchTaskForm({
        title: item.title, description: item.description, duration: item.durationMinutes ?? '',
        deadline: item.deadline ?? '', priority: item.priority, energyLevel: item.energyLevel,
      });
    }
  };

  // A block dragged to a new time or day: events are saved as moved; work sessions move and get
  // pinned there, and the rest of the plan adjusts around them.
  const moveBlock: MoveBlock = async (ev, date, startMin) => {
    const endMin = startMin + blockMinutes(ev);
    if (ev.isTaskSession && ev.sessionIndex !== undefined) {
      const taskId = taskIdFromCalendarId(ev.id);
      const row = tasks.find(t => String(t.id) === taskId)?.sessions?.[ev.sessionIndex];
      if (row) await planner.moveTaskSession(taskId, row, localMs(date, startMin), localMs(date, endMin));
      return;
    }
    const error = await eventActions.updateEvent(ev.id, { ...eventFormFromEvent(ev), date, start: timeOfDay(startMin), end: timeOfDay(endMin) });
    if (error) setMoveError(`Couldn't move "${ev.title}": ${error}`);
  };

  // Runs a save/delete; closes the modal on success, or shows the error in it.
  const submit = async (action: () => Promise<string | null>) => {
    modal.setError(null);
    const error = await action();
    if (error) modal.setError(error);
    else modal.close();
  };

  const saveEvent = () => submit(() => modal.editingEventId
    ? eventActions.updateEvent(modal.editingEventId, modal.eventForm)
    : eventActions.createEvent(modal.eventForm));

  const saveTask = async () => {
    modal.setError(null);
    const error = await taskActions.saveTask(modal.taskForm, modal.editingTaskId, modal.close);
    if (error) modal.setError(error);
  };

  const viewProps = { currentDate, events: displayEvents, accentColor };
  const toast = moveError ? { text: moveError, error: true } : google.message;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', backgroundColor: '#fff', color: '#1a1a1a' }}>

      {/* Top Nav */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #e5e5e5', gap: 16 }}>
        <DateNavigator view={view} currentDate={currentDate} setCurrentDate={setCurrentDate} />
        <ViewSwitcher view={view} setView={setView} accentColor={accentColor} />
        <QuickAddBar onParsed={reviewParsed} />
        <ProfileMenu
          googleConnected={google.connected}
          googleBusy={google.busy}
          onProfile={() => setShowProfile(true)}
          onConnectGoogle={google.connect}
          onSyncGoogle={() => google.sync()}
          onDisconnectGoogle={google.disconnect}
          onSignOut={data.signOut}
        />
      </div>

      {/* Content Row */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {view === 'Week' && <WeekView {...viewProps} openAdd={modal.openNewEventAt} openDetail={openDetail} onMove={moveBlock} />}
          {view === 'Day' && <DayView {...viewProps} openAdd={modal.openNewEventAt} openDetail={openDetail} onMove={moveBlock} />}
          {view === 'Month' && <MonthView {...viewProps} openAdd={modal.openNewEventAt} openDetail={openDetail} />}
          {view === 'Year' && <YearView {...viewProps} onPickDay={d => { setCurrentDate(d); setView('Day'); }} />}
        </div>

        <TaskSidebar
          tasks={tasks}
          accentColor={accentColor}
          workPlan={data.workPlan}
          estimateRatio={planner.ratio}
          planning={planner.planning}
          planMessage={planner.planMessage}
          createdMessage={taskActions.createdMessage}
          completingTaskId={taskActions.completingTaskId}
          showUndo={taskActions.hasUndo}
          atRisk={planner.atRisk}
          checkIns={checkIns}
          onCheckIn={planner.updateTaskSession}
          onOpenSession={showSession}
          onNew={modal.openNew}
          onPlanWeek={() => planner.planWeek()}
          onOpenWorkPlan={() => planner.setShowWorkPlan(true)}
          onOpenTask={modal.openTask}
          onCompleteTask={taskActions.completeTask}
          onUndoDelete={taskActions.undoDelete}
        />
      </div>

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, maxWidth: 340, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', background: toast.error ? '#fef2f2' : '#f0fdf4', color: toast.error ? '#b91c1c' : '#16a34a' }}>{toast.text}</div>
      )}

      {planner.showWorkPlan && (
        <WorkPlanModal
          initial={data.workPlan ?? DEFAULT_WORK_PLAN}
          firstTime={!data.workPlan}
          history={planner.history}
          accentColor={accentColor}
          textOnAccent={getTextColor(accentColor)}
          onClose={() => planner.setShowWorkPlan(false)}
          onSave={(plan, replan) => {
            planner.setShowWorkPlan(false);
            planner.saveWorkPlan(plan);
            if (replan) planner.planWeek(plan);
          }}
        />
      )}

      {modal.isOpen && (
        <ItemModal
          tab={modal.tab}
          onTabChange={modal.switchTab}
          accentColor={accentColor}
          error={modal.error}
          isEditingTask={modal.editingTaskId !== null}
          isEditingEvent={modal.editingEventId !== null}
          taskForm={modal.taskForm}
          onTaskChange={modal.patchTaskForm}
          eventForm={modal.eventForm}
          onEventChange={modal.patchEventForm}
          onClose={modal.close}
          onSaveTask={saveTask}
          onDeleteTask={() => { taskActions.deleteTask(modal.editingTaskId!); modal.close(); }}
          onSaveEvent={saveEvent}
          onDeleteEvent={() => submit(() => eventActions.deleteEvent(modal.editingEventId!))}
        />
      )}

      {openSession && sessionTask && session && (
        <SessionModal
          title={sessionTask.title}
          session={session}
          nowMs={openSession.openedAt}
          accentColor={accentColor}
          onChange={change => planner.updateTaskSession(String(sessionTask.id), session, change)}
          onEditTask={() => modal.openTask(sessionTask)}
          onClose={() => setOpenSession(null)}
        />
      )}

      {showProfile && (
        <ProfileModal profile={data.profile} accentColor={accentColor} onSave={data.saveProfile} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}
