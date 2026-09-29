import json
import os
import time
from datetime import datetime
from app.models import Task
from app.scheduler.intervals import Interval
from app.scheduler.tasks import sort_scheduling_tasks
from app.scheduler.scheduler import score_task
from app.scheduler.heuristic_scheduler import schedule_tasks_greedy
from scenarios import (
    SCENARIOS,
    _ms, _now, _fmt_duration, _fmt_time, _fmt_iso, _build_task,
    _print_scenario_header, _print_results,
    PRIORITY_ICON,
)

OUTPUT_DIR = "test_outputs"
OUTPUT_JS  = os.path.join(OUTPUT_DIR, "heuristic_output.js")
VAR_NAME   = "HEURISTIC_DATA"


# ============================================================
#  JSON DATA COLLECTION  (mirrors test_cpsat's shape)
# ============================================================

def _collect_scenario_data(scenario: dict, horizon: Interval, tasks: list, placements: list, elapsed: float, status: str = "") -> dict:
    placed_names = {p.task.name for p in placements}
    all_names    = {t.name for t in tasks}
    skipped      = all_names - placed_names

    specs = scenario["tasks"]
    required_specs = [s for s in specs if s.get("requirement") == "required"]
    optional_specs = [s for s in specs if s.get("requirement") != "required"]
    total_minutes    = sum(s["duration_minutes"] for s in specs)
    required_minutes = sum(s["duration_minutes"] for s in required_specs)
    optional_minutes = sum(s["duration_minutes"] for s in optional_specs)
    horizon_minutes  = (horizon.end_ms - horizon.start_ms) // 60_000
    total_score      = sum(score_task(p.task, p.interval) for p in placements)

    def task_data(spec: dict) -> dict:
        d = {
            "name":             spec["name"],
            "duration_minutes": spec["duration_minutes"],
            "priority":         spec.get("priority", "medium"),
            "requirement":      spec.get("requirement", "optional"),
        }
        for field in ("preferred", "allowed", "blackout"):
            pair = spec.get(field)
            d[f"{field}_start"] = pair[0] if pair else None
            d[f"{field}_end"]   = pair[1] if pair else None
        return d

    def placement_data(p) -> dict:
        return {
            "name":             p.task.name,
            "start":            datetime.fromtimestamp(p.interval.start_ms / 1000).isoformat(),
            "end":              datetime.fromtimestamp(p.interval.end_ms   / 1000).isoformat(),
            "duration_minutes": (p.interval.end_ms - p.interval.start_ms) // 60_000,
            "priority":         p.task.priority,
            "requirement":      p.task.requirement,
            "score":            round(score_task(p.task, p.interval), 2),
        }

    h_start, h_end = scenario["horizon"]
    sorted_placements = sorted(placements, key=lambda p: p.interval.start_ms)

    return {
        "name":                  scenario["name"],
        "horizon_start":         h_start,
        "horizon_end":           h_end,
        "horizon_minutes":       horizon_minutes,
        "total_task_minutes":    total_minutes,
        "required_task_minutes": required_minutes,
        "optional_task_minutes": optional_minutes,
        "fits_all":              total_minutes    <= horizon_minutes,
        "fits_required":         required_minutes <= horizon_minutes,
        "elapsed_ms":            round(elapsed * 1000, 1),
        "total_score":           round(total_score, 2),
        "placed_count":          len(placements),
        "total_count":           len(tasks),
        "tasks":                 [task_data(s) for s in scenario["tasks"]],
        "placements":            [placement_data(p) for p in sorted_placements],
        "skipped_optional":      [t.name for t in tasks if t.name in skipped and t.requirement == "optional"],
        "unplaced_required":     [t.name for t in tasks if t.name in skipped and t.requirement == "required"],
        "solver_status":         status,
    }


# ============================================================
#  RUNNER
# ============================================================

def run_scenario(scenario: dict) -> dict:
    h_start, h_end = scenario["horizon"]
    horizon = Interval(start_ms=_ms(h_start), end_ms=_ms(h_end))
    tasks   = [_build_task(i, spec) for i, spec in enumerate(scenario["tasks"])]

    _print_scenario_header(scenario, horizon)

    print(f"  Running Greedy... ", end="", flush=True)
    t0 = time.perf_counter()
    scheduling_tasks = sort_scheduling_tasks(tasks, horizon)
    placements, status = schedule_tasks_greedy(scheduling_tasks, horizon)
    elapsed = time.perf_counter() - t0

    print(f"{status} ({_fmt_time(elapsed)})", flush=True)
    _print_results(placements, tasks, elapsed)
    return _collect_scenario_data(scenario, horizon, tasks, placements, elapsed, status)


def _write_output(all_data: list) -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "scheduler":    "heuristic",
        "scenarios":    all_data,
    }
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(f"const {VAR_NAME} = ")
        json.dump(output, f, indent=2)
        f.write(";\n")
    print(f"\n  UI data written to {OUTPUT_JS}  ->  open test_ui.html in a browser")


def main() -> None:
    all_data = []

    try:
        for i, scenario in enumerate(SCENARIOS):
            sep = "=" * 72
            print(sep)
            print(f"  Scenario {i+1}/{len(SCENARIOS)}: {scenario['name']}")
            print(sep)
            data = run_scenario(scenario)
            all_data.append(data)

        print("=" * 72)
        print("  Done.")
        print("=" * 72)

    except KeyboardInterrupt:
        print("\n\n  Interrupted — saving completed scenarios...")

    finally:
        if all_data:
            _write_output(all_data)
        else:
            print("  No scenarios completed, nothing written.")


if __name__ == "__main__":
    main()
