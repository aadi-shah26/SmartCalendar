from datetime import datetime
from app.models import Task
from .intervals import Interval
from .interval_set import IntervalSet
from .tasks import SchedulingTask, TaskPlacement
from .scheduler import score_task, generate_domain


_PRIORITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def schedule_tasks_greedy(
    scheduling_tasks: list[SchedulingTask],
    horizon: Interval,
) -> tuple[list[TaskPlacement], str]:
    """
    Fast greedy scheduler with MRV + priority ordering.

    Required tasks before optional.
    Within each group: least-flexible first, then highest priority.
    For each task, pick the highest-scoring slot that fits in free time.
    """
    free = IntervalSet([horizon])
    placements: list[TaskPlacement] = []
    unplaced_required: list[str] = []

    ordered = sorted(
        scheduling_tasks,
        key=lambda st: (
            0 if st.task.requirement == "required" else 1,
            st.flexibility_score,
            -_PRIORITY_RANK.get(st.task.priority, 2),
        ),
    )

    for st in ordered:
        feasible = st.allowed_intervals.intersect(free)
        domain = generate_domain(st.task, feasible)

        if not domain:
            if st.task.requirement == "required":
                unplaced_required.append(st.task.id)
            continue

        best = max(
            domain,
            key=lambda slot: score_task(
                st.task,
                slot,
                horizon.start_ms,
                horizon.end_ms,
            ),
        )
        placements.append(TaskPlacement(task=st.task, interval=best))
        free = free.subtract(IntervalSet([best]))

    if unplaced_required:
        status = f"GREEDY_PARTIAL ({len(unplaced_required)} required unplaced)"
    else:
        status = "GREEDY_OK"

    return placements, status


def print_placements(placements: list[TaskPlacement]) -> None:
    if not placements:
        print("No tasks were scheduled.")
        return

    sorted_placements = sorted(placements, key=lambda p: p.interval.start_ms)

    print("\n===== GREEDY SCHEDULE =====\n")

    for p in sorted_placements:
        start = datetime.fromtimestamp(
            p.interval.start_ms / 1000
        ).strftime("%m/%d/%Y, %I:%M %p")
        end = datetime.fromtimestamp(
            p.interval.end_ms / 1000
        ).strftime("%m/%d/%Y, %I:%M %p")

        score = score_task(p.task, p.interval)
        req = p.task.requirement

        print(f"{p.task.name}  [{req}, {p.task.priority}]  (score: {score:.2f})")
        print(f"  {start} — {end}")
        print()
