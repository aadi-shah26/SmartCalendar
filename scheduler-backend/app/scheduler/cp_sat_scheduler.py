from ortools.sat.python import cp_model
from datetime import datetime
from app.models import Task
from .intervals import Interval
from .tasks import SchedulingTask, TaskPlacement
from .scheduler import score_task, generate_domain, deadline_urgency_multiplier

# Priority order: placement >> earliness >> quality
# Placement: 1B guarantees placing any task always beats skipping it
# Earliness: 1000/step ≈ 288K/day — placing a task tomorrow beats placing it next week
# Quality: max ~15K — tiebreaker within about ±1 hour of equal earliness
_PLACEMENT_BONUS = 1_000_000_000
_SCORE_SCALE = 100
_EARLY_PER_STEP = 5_000


_STATUS_LABELS = {
    cp_model.OPTIMAL:       "OPTIMAL",
    cp_model.FEASIBLE:      "FEASIBLE (time limit hit)",
    cp_model.INFEASIBLE:    "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN:       "UNKNOWN",
}


def _choose_step_ms(horizon: Interval, scheduling_tasks: list[SchedulingTask]) -> int:
    """
    Discretizes based on task load
    """
    horizon_minutes = (horizon.end_ms - horizon.start_ms) // 60_000
    num_tasks = len(scheduling_tasks)

    if num_tasks <= 0:
        return 5 * 60_000

    # Load w 5 min granularity as baseline
    load_5 = (horizon_minutes * num_tasks) / 5.0

    if load_5 <= 4000:
        step_minutes = 5
    elif load_5 <= 14000:
        step_minutes = 10
    else:
        # Keep domains reasonably fine to avoid missing obvious early gaps.
        step_minutes = 15

    return step_minutes * 60_000

def schedule_tasks_cpsat(
    scheduling_tasks: list[SchedulingTask],
    horizon: Interval,
) -> tuple[list[TaskPlacement], str]:
    model = cp_model.CpModel()

    all_interval_vars = []
    placement_terms = []  # P * placed[i]  — coverage incentive
    score_terms = []      # slot_score(i,j) * x[i][j]  — quality tiebreaker
    early_terms = []      # earliness bonus — prefer slots closer to horizon_start
    task_assignments: list[tuple[SchedulingTask, list[tuple[cp_model.IntVar, Interval]]]] = []

    step_ms = _choose_step_ms(horizon, scheduling_tasks)

    for i, st in enumerate(scheduling_tasks):
        domain = generate_domain(st.task, st.allowed_intervals, step_ms)
        slot_vars: list[tuple[cp_model.IntVar, Interval]] = []
        urgency = deadline_urgency_multiplier(st.task, horizon.start_ms, horizon.end_ms)

        # placed[i] = 1 if this task gets any slot assigned
        placed = model.new_bool_var(f"placed_{i}")

        for j, slot in enumerate(domain):
            x = model.new_bool_var(f"t{i}_s{j}")

            iv = model.new_optional_interval_var(
                slot.start_ms,
                slot.end_ms - slot.start_ms,
                slot.end_ms,
                x,
                f"iv_t{i}_s{j}",
            )
            all_interval_vars.append(iv)

            score = int(
                score_task(
                    st.task,
                    slot,
                    horizon.start_ms,
                    horizon.end_ms,
                ) * _SCORE_SCALE
            )
            score_terms.append(score * x)

            # Each step closer to horizon_start earns _EARLY_PER_STEP bonus.
            # Using discrete step counts avoids the integer-truncation bug that
            # made all slots look equal when normalized over a 7-day span.
            steps_remaining = int((horizon.end_ms - slot.start_ms) // step_ms)
            early_terms.append(int(steps_remaining * _EARLY_PER_STEP * urgency) * x)

            slot_vars.append((x, slot))

        bool_vars = [x for x, _ in slot_vars]

        # Every task is assigned at most once
        if bool_vars:
            model.add(sum(bool_vars) <= 1)
            # placed[i] == 1 iff any slot is chosen
            model.add(placed == sum(bool_vars))
        else:
            model.add(placed == 0)

        # Required tasks must be assigned
        if st.task.requirement == "required":
            if not bool_vars:
                return [], "INFEASIBLE"
            model.add(sum(bool_vars) >= 1)

        placement_terms.append(_PLACEMENT_BONUS * _SCORE_SCALE * placed)
        task_assignments.append((st, slot_vars))

    model.add_no_overlap(all_interval_vars)

    # Maximizes placement, then earliness, then quality.
    if placement_terms or score_terms or early_terms:
        model.maximize(
            sum(placement_terms)
            + sum(early_terms)
            + sum(score_terms)
        )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    # Keep shuffle behavior stable across runs while still optimizing objective.
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 42
    status = solver.solve(model)
    status_label = _STATUS_LABELS.get(status, "UNKNOWN")

    placements = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for st, slot_vars in task_assignments:
            for x, slot in slot_vars:
                if solver.value(x):
                    placements.append(TaskPlacement(task=st.task, interval=slot))
                    break

    return placements, status_label


def print_placements(placements: list[TaskPlacement]) -> None:
    if not placements:
        print("No tasks were scheduled.")
        return

    sorted_placements = sorted(placements, key=lambda p: p.interval.start_ms)

    print("\n===== CP-SAT SCHEDULE =====\n")

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
