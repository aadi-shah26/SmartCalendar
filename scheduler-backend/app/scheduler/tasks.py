from dataclasses import dataclass
from app.models import Task
from .intervals import Interval
from .interval_set import IntervalSet
from .windows import find_allowed_intervals


@dataclass
class SchedulingTask:
    task: Task
    allowed_intervals: IntervalSet
    flexibility_score: float


@dataclass
class TaskPlacement:
    task: Task
    interval: Interval


def _compute_flexibility(task: Task, allowed: IntervalSet) -> float:
    duration_ms = task.duration_minutes * 60 * 1000
    total_allowed = allowed.total_duration_ms()
    if total_allowed == 0:
        return float("inf")
    return total_allowed / duration_ms


def build_scheduling_task(task: Task, horizon: Interval) -> SchedulingTask:
    allowed_intervals = find_allowed_intervals(task, horizon)
    flexibility_score = _compute_flexibility(task, allowed_intervals)
    return SchedulingTask(
        task=task,
        allowed_intervals=allowed_intervals,
        flexibility_score=flexibility_score,
    )


def sort_scheduling_tasks(tasks: list[Task], horizon: Interval) -> list[SchedulingTask]:
    scheduling_tasks = [build_scheduling_task(t, horizon) for t in tasks]
    scheduling_tasks.sort(key=lambda st: st.flexibility_score)
    return scheduling_tasks
