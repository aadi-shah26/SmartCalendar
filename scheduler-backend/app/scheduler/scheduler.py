from datetime import datetime
from app.models import Task
from .intervals import Interval
from .interval_set import IntervalSet
from .tasks import SchedulingTask, TaskPlacement
from .windows import windows_to_interval_set
from .times import parse_iso_to_ms

_STEP_MS = 15 * 60 * 1000
_EARLINESS_MAX_BONUS = 300.0


# ============================================================
# SOFT CONSTRAINT SCORING
# ============================================================

def score_task(
    task: Task,
    interval: Interval,
    horizon_start_ms: int | None = None,
    horizon_end_ms: int | None = None,
) -> float:
    preference_score = _score_preferred_windows(task, interval)
    urgency = deadline_urgency_multiplier(task, horizon_start_ms, horizon_end_ms)
    earliness_score = _score_earliness(interval, horizon_start_ms, horizon_end_ms) * urgency
    priority_weight = _priority_multiplier(task.priority)

    return (preference_score + earliness_score) * priority_weight


def deadline_urgency_multiplier(
    task: Task,
    horizon_start_ms: int | None,
    horizon_end_ms: int | None,
) -> float:
    """
    Nearer deadlines get stronger pull toward earlier placement.
    Later deadlines get weaker early-placement pressure.
    """
    if horizon_start_ms is None or horizon_end_ms is None:
        return 1.0

    constraints = task.constraints
    latest_end = constraints.latest_end if constraints else None
    if not latest_end:
        return 1.0

    try:
        deadline_ms = parse_iso_to_ms(latest_end)
    except Exception:
        return 1.0

    horizon_span_ms = max(horizon_end_ms - horizon_start_ms, 1)
    deadline_distance_ms = max(deadline_ms - horizon_start_ms, 0)
    clamped_distance_ms = min(deadline_distance_ms, horizon_span_ms)

    # 0.35x (far deadline) .. 1.85x (immediate deadline)
    urgency_ratio = 1.0 - (clamped_distance_ms / horizon_span_ms)
    return 0.35 + (urgency_ratio * 1.5)


def _score_earliness(
    interval: Interval,
    horizon_start_ms: int | None,
    horizon_end_ms: int | None,
) -> float:
    """
    Soft constraint: prefer earlier starts in the planning horizon.

    Returns a score in [0, _EARLINESS_MAX_BONUS]. Earliest slots get the
    largest bonus; slots near horizon end get close to zero.
    """
    if horizon_start_ms is None or horizon_end_ms is None:
        return 0.0

    span = max(horizon_end_ms - horizon_start_ms, 1)
    elapsed = max(interval.start_ms - horizon_start_ms, 0)
    if elapsed >= span:
        return 0.0

    return ((span - elapsed) / span) * _EARLINESS_MAX_BONUS


def _score_preferred_windows(task: Task, interval: Interval) -> float:
    preferred_windows = task.constraints.preferred_windows if task.constraints else None
    if not preferred_windows:
        return 0.0

    candidate_set = IntervalSet([interval])
    preferred_set = windows_to_interval_set(preferred_windows, interval)

    overlap_ms = candidate_set.intersect(preferred_set).total_duration_ms()
    candidate_duration_ms = interval.end_ms - interval.start_ms

    if candidate_duration_ms <= 0:
        return 0.0

    return (overlap_ms / candidate_duration_ms) * 100


def _score_energy(task: Task, interval: Interval) -> float:
    """
    Soft constraint: try to match task energy level with time of day.
    """
    if not task.constraints or not task.constraints.energy_level:
        return 0.0

    hour = datetime.fromtimestamp(interval.start_ms / 1000).hour
    energy = task.constraints.energy_level

    if energy == "high":
        return 20 if 8 <= hour <= 12 else 0
    if energy == "medium":
        return 10 if 12 <= hour <= 17 else 0
    if energy == "low":
        return 10 if hour >= 18 or hour <= 7 else 0

    return 0.0


def _priority_multiplier(priority: str | None) -> float:
    weights = {
        "low": 1.0,
        "medium": 1.1,
        "high": 1.25,
        "critical": 1.5,
    }
    return weights.get(priority or "medium", 1.1)



# ============================================================
# HARD CONSTRAINT FILTERING (CSP DOMAIN REDUCTION)
# ============================================================

def apply_hard_constraints(
    task: Task,
    feasible: IntervalSet,
) -> IntervalSet:
    """
    Remove intervals violating hard constraints.
    Note: allowed_windows, blackout_windows, earliest_start, latest_end
    are already applied by find_allowed_intervals. This handles any
    per-task blackouts that weren't captured there.
    """
    constraints = task.constraints
    if not constraints:
        return feasible

    result = feasible

    feasible_list = feasible.to_list()
    if not feasible_list:
        return feasible
    horizon = Interval(feasible_list[0].start_ms, feasible_list[-1].end_ms)

    if constraints.blackout_windows:
        blackout = windows_to_interval_set(constraints.blackout_windows, horizon)
        result = result.subtract(blackout)

    return result


# ============================================================
# DOMAIN GENERATION
# ============================================================

def generate_domain(
    task: Task,
    feasible: IntervalSet,
    step_ms: int = _STEP_MS,
) -> list[Interval]:
    """
    Generate candidate placements for CSP search.
    """
    duration_ms = task.duration_minutes * 60 * 1000
    domain = []

    for interval in feasible.to_list():
        length = interval.end_ms - interval.start_ms
        if length < duration_ms:
            continue

        latest_start = interval.end_ms - duration_ms
        start_ms = interval.start_ms

        while start_ms <= latest_start:
            domain.append(
                Interval(start_ms=start_ms, end_ms=start_ms + duration_ms)
            )
            start_ms += step_ms

    return domain


# ============================================================
# CSP SEARCH
# ============================================================

def backtracking_search(
    tasks: list[SchedulingTask],
    free: IntervalSet,
    placements: list[TaskPlacement],
    best_solution: list[TaskPlacement],
) -> list[TaskPlacement]:

    if not tasks:
        if len(placements) > len(best_solution):
            return placements.copy()
        return best_solution

    st = tasks[0]
    remaining = tasks[1:]

    feasible = st.allowed_intervals.intersect(free)
    feasible = apply_hard_constraints(st.task, feasible)

    domain = generate_domain(st.task, feasible)

    # Sort domain by soft constraint score (CSP heuristic)
    domain.sort(key=lambda i: score_task(st.task, i), reverse=True)

    for interval in domain:
        new_free = free.subtract(IntervalSet([interval]))
        placements.append(TaskPlacement(task=st.task, interval=interval))

        best_solution = backtracking_search(
            remaining,
            new_free,
            placements,
            best_solution,
        )

        placements.pop()

    # Also try skipping this task entirely so remaining tasks are still explored
    best_solution = backtracking_search(remaining, free, placements, best_solution)

    return best_solution


# ============================================================
# MAIN SCHEDULER
# ============================================================

def schedule_tasks(
    scheduling_tasks: list[SchedulingTask],
    horizon: Interval,
) -> list[TaskPlacement]:

    free = IntervalSet([horizon])

    # Heuristic: schedule critical tasks first
    scheduling_tasks.sort(
        key=lambda st: _priority_multiplier(st.task.priority),
        reverse=True,
    )

    best = backtracking_search(
        scheduling_tasks,
        free,
        [],
        [],
    )

    return best


# ============================================================
# OUTPUT
# ============================================================

def print_placements(placements: list[TaskPlacement]) -> None:
    if not placements:
        print("No tasks were scheduled.")
        return

    sorted_placements = sorted(placements, key=lambda p: p.interval.start_ms)

    print("\n===== SCHEDULE =====\n")

    for p in sorted_placements:
        start = datetime.fromtimestamp(
            p.interval.start_ms / 1000
        ).strftime("%m/%d/%Y, %I:%M %p")
        end = datetime.fromtimestamp(
            p.interval.end_ms / 1000
        ).strftime("%m/%d/%Y, %I:%M %p")

        print(f"{p.task.name}")
        print(f"  {start} to {end}")
        print()