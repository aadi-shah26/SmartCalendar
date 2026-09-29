from datetime import datetime
from app.models import Task, SchedulingConstraints, TimeWindow
from app.scheduler.intervals import Interval
from app.scheduler.tasks import sort_scheduling_tasks
from app.scheduler.scheduler import schedule_tasks, print_placements


def now_iso() -> str:
    return datetime.now().isoformat()


def build_task(
    id: str,
    name: str,
    duration_minutes: int,
    priority: str,
    flexibility: str,
    requirement: str,
    preferred_start: str | None = None,
    preferred_end: str | None = None,
    allowed_start: str | None = None,
    allowed_end: str | None = None,
) -> Task:
    constraints = SchedulingConstraints()

    if preferred_start and preferred_end:
        constraints.preferred_windows = [
            TimeWindow(kind="absolute", start=preferred_start, end=preferred_end)
        ]

    if allowed_start and allowed_end:
        constraints.allowed_windows = [
            TimeWindow(kind="absolute", start=allowed_start, end=allowed_end)
        ]

    return Task(
        id=id,
        user_id="user-1",
        kind="task",
        name=name,
        priority=priority,
        flexibility=flexibility,
        requirement=requirement,
        is_completed=False,
        created_at=now_iso(),
        updated_at=now_iso(),
        duration_minutes=duration_minutes,
        constraints=constraints,
    )


def get_preset_scenario() -> tuple[Interval, list[Task]]:
    horizon = Interval(
        start_ms=int(datetime.fromisoformat("2026-03-18T08:00:00").timestamp() * 1000),
        end_ms=int(datetime.fromisoformat("2026-03-18T20:00:00").timestamp() * 1000),
    )

    tasks = [
        build_task(
            id="task-1",
            name="Homework",
            duration_minutes=120,
            priority="high",
            flexibility="movable",
            requirement="required",
            preferred_start="2026-03-18T10:00:00",
            preferred_end="2026-03-18T14:00:00",
        ),
        build_task(
            id="task-2",
            name="Workout",
            duration_minutes=60,
            priority="medium",
            flexibility="movable",
            requirement="optional",
            preferred_start="2026-03-18T17:00:00",
            preferred_end="2026-03-18T19:00:00",
        ),
        Task(
            id="task-3",
            user_id="user-1",
            kind="task",
            name="Read",
            description="Read chapter 4",
            priority="low",
            flexibility="movable",
            requirement="optional",
            is_completed=False,
            created_at=now_iso(),
            updated_at=now_iso(),
            duration_minutes=90,
            constraints=SchedulingConstraints(
                allowed_windows=[
                    TimeWindow(kind="absolute", start="2026-03-18T08:00:00", end="2026-03-18T20:00:00")
                ],
                blackout_windows=[
                    TimeWindow(kind="absolute", start="2026-03-18T12:00:00", end="2026-03-18T13:00:00")
                ],
                preferred_windows=[
                    TimeWindow(kind="absolute", start="2026-03-18T09:00:00", end="2026-03-18T11:00:00")
                ],
            ),
        ),
    ]

    return horizon, tasks


def get_interactive_scenario() -> tuple[Interval, list[Task]]:
    horizon_start = input("Enter horizon start (ISO, e.g. 2026-03-18T08:00:00): ").strip()
    horizon_end = input("Enter horizon end   (ISO, e.g. 2026-03-18T20:00:00): ").strip()
    horizon = Interval(
        start_ms=int(datetime.fromisoformat(horizon_start).timestamp() * 1000),
        end_ms=int(datetime.fromisoformat(horizon_end).timestamp() * 1000),
    )

    count = int(input("How many tasks? ").strip())
    tasks: list[Task] = []

    for i in range(1, count + 1):
        print(f"\n--- Enter task {i} ---")
        name = input(f"Task {i} name: ").strip()
        duration = int(input("Duration in minutes: ").strip())

        priority_raw = input("Priority (low/medium/high/critical) [medium]: ").strip().lower()
        priority = priority_raw if priority_raw in ("low", "medium", "high", "critical") else "medium"

        flex_raw = input("Flexibility (locked/movable) [movable]: ").strip().lower()
        flexibility = flex_raw if flex_raw in ("locked", "movable") else "movable"

        req_raw = input("Requirement (required/optional) [required]: ").strip().lower()
        requirement = req_raw if req_raw in ("required", "optional") else "required"

        preferred_start = input("Preferred window start ISO (blank for none): ").strip() or None
        preferred_end = input("Preferred window end   ISO (blank for none): ").strip() or None
        allowed_start = input("Allowed window start ISO (blank for none): ").strip() or None
        allowed_end = input("Allowed window end   ISO (blank for none): ").strip() or None

        tasks.append(build_task(
            id=f"task-{i}",
            name=name,
            duration_minutes=duration,
            priority=priority,
            flexibility=flexibility,
            requirement=requirement,
            preferred_start=preferred_start,
            preferred_end=preferred_end,
            allowed_start=allowed_start,
            allowed_end=allowed_end,
        ))

    return horizon, tasks


def main() -> None:
    print("Choose mode:")
    print("1) Run preset scenario")
    print("2) Enter tasks interactively")
    choice = input("Selection [1/2]: ").strip()

    if choice == "2":
        horizon, tasks = get_interactive_scenario()
    else:
        horizon, tasks = get_preset_scenario()

    scheduling_tasks = sort_scheduling_tasks(tasks, horizon)
    placements = schedule_tasks(scheduling_tasks, horizon)

    print("\n")
    print_placements(placements)


if __name__ == "__main__":
    main()
