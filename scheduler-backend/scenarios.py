
from datetime import datetime
from app.models import Task, SchedulingConstraints, TimeWindow
from app.scheduler.intervals import Interval
from app.scheduler.scheduler import score_task

# ============================================================
#  HELPERS
# ============================================================

def _ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).timestamp() * 1000)

def _now() -> str:
    return datetime.now().isoformat()

def _fmt_duration(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes}m"
    h, m = divmod(minutes, 60)
    return f"{h}h{m:02d}m" if m else f"{h}h"

def _fmt_time(s: float) -> str:
    return f"{s * 1000:.0f}ms" if s < 1 else f"{s:.2f}s"

def _fmt_iso(iso: str) -> str:
    return datetime.fromisoformat(iso).strftime("%a %b %d, %I:%M %p")

def _build_task(idx: int, spec: dict) -> Task:
    c = SchedulingConstraints()
    if spec.get("preferred"):
        s, e = spec["preferred"]
        c.preferred_windows = [TimeWindow(kind="absolute", start=s, end=e)]
    if spec.get("allowed"):
        s, e = spec["allowed"]
        c.allowed_windows = [TimeWindow(kind="absolute", start=s, end=e)]
    if spec.get("blackout"):
        s, e = spec["blackout"]
        c.blackout_windows = [TimeWindow(kind="absolute", start=s, end=e)]
    return Task(
        id=f"t{idx}", user_id="u1", kind="task",
        name=spec["name"],
        priority=spec.get("priority", "medium"),
        flexibility="movable",
        requirement=spec.get("requirement", "optional"),
        is_completed=False,
        created_at=_now(), updated_at=_now(),
        duration_minutes=spec["duration_minutes"],
        constraints=c,
    )


# ============================================================
#  PRINTING
# ============================================================

PRIORITY_ICON = {"low": "v", "medium": "~", "high": "^", "critical": "!!"}

def _print_scenario_header(scenario: dict, horizon: Interval) -> None:
    h_start_iso, h_end_iso = scenario["horizon"]
    horizon_minutes = (horizon.end_ms - horizon.start_ms) // 60_000
    specs = scenario["tasks"]

    required = [s for s in specs if s.get("requirement") == "required"]
    optional = [s for s in specs if s.get("requirement") != "required"]
    total_minutes = sum(s["duration_minutes"] for s in specs)
    required_minutes = sum(s["duration_minutes"] for s in required)
    optional_minutes = sum(s["duration_minutes"] for s in optional)

    fits_all      = total_minutes <= horizon_minutes
    fits_required = required_minutes <= horizon_minutes

    print(f"  Horizon   {_fmt_iso(h_start_iso)}  ->  {_fmt_iso(h_end_iso)}  ({_fmt_duration(horizon_minutes)} available)")
    print(f"  Tasks     {len(specs)} total  |  {len(required)} required ({_fmt_duration(required_minutes)})  |  {len(optional)} optional ({_fmt_duration(optional_minutes)})")
    print(f"  Capacity  {_fmt_duration(total_minutes)} of work  vs  {_fmt_duration(horizon_minutes)} available  ->  ", end="")
    if fits_all:
        print("all tasks can fit")
    elif fits_required:
        print(f"required tasks fit, but {_fmt_duration(total_minutes - horizon_minutes)} of optional time will be dropped")
    else:
        print(f"OVER CAPACITY — even required tasks need {_fmt_duration(required_minutes - horizon_minutes)} more than available")
    print()

    # Task list
    col = 32
    print(f"  {'Task':<{col}} {'Dur':>5}  {'Pri':>8}  {'Req':>8}  Notes")
    print(f"  {'-'*col}  {'-----'}  {'--------'}  {'--------'}  -----")
    for s in specs:
        notes = []
        if s.get("preferred"):
            ps, pe = s["preferred"]
            notes.append(f"prefer {datetime.fromisoformat(ps).strftime('%I:%M')}-{datetime.fromisoformat(pe).strftime('%I:%M %p')}")
        if s.get("allowed"):
            notes.append("restricted window")
        if s.get("blackout"):
            notes.append("has blackout")
        icon = PRIORITY_ICON.get(s.get("priority", "medium"), "~")
        req  = s.get("requirement", "optional")
        print(f"  {s['name']:<{col}} {_fmt_duration(s['duration_minutes']):>5}  {icon+' '+s.get('priority','medium'):>8}  {req:>8}  {', '.join(notes)}")
    print()


def _print_results(placements, tasks: list[Task], elapsed: float) -> None:
    placed_names = {p.task.name for p in placements}
    all_names    = {t.name for t in tasks}
    skipped      = all_names - placed_names

    required_skipped = [t.name for t in tasks if t.name in skipped and t.requirement == "required"]
    optional_skipped = [t.name for t in tasks if t.name in skipped and t.requirement == "optional"]

    total_score = sum(score_task(p.task, p.interval) for p in placements)
    sorted_p    = sorted(placements, key=lambda p: p.interval.start_ms)

    print(f"  Solved in {_fmt_time(elapsed)}  |  {len(placements)}/{len(tasks)} tasks placed  |  total score {total_score:.1f}")
    print()

    if sorted_p:
        print(f"  {'Time':>25}    {'Task':<32}  {'Dur':>5}  {'Score':>7}")
        print(f"  {'----':>25}    {'----':<32}  {'---':>5}  {'-----':>7}")
        for p in sorted_p:
            start_str = datetime.fromtimestamp(p.interval.start_ms / 1000).strftime("%a %b %d  %I:%M %p")
            end_str   = datetime.fromtimestamp(p.interval.end_ms   / 1000).strftime("%I:%M %p")
            dur       = (p.interval.end_ms - p.interval.start_ms) // 60_000
            sc        = score_task(p.task, p.interval)
            print(f"  {start_str} -> {end_str}    {p.task.name:<32}  {_fmt_duration(dur):>5}  {sc:>7.1f}")

    if optional_skipped:
        print()
        print(f"  Dropped (optional, no room):  {', '.join(sorted(optional_skipped))}")
    if required_skipped:
        print()
        print(f"  !! UNPLACED REQUIRED:  {', '.join(sorted(required_skipped))}")
    print()


SCENARIOS = [

    # ── Small ────────────────────────────────────────────────
    {
        "name": "Small — 3 tasks, all fit comfortably",
        "horizon": ("2026-04-20T08:00:00", "2026-04-20T20:00:00"),
        "tasks": [
            {"name": "Homework",      "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-20T10:00:00", "2026-04-20T14:00:00")},
            {"name": "Workout",       "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-20T17:00:00", "2026-04-20T19:00:00")},
            {"name": "Read chapter",  "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-20T09:00:00", "2026-04-20T11:00:00"),
             "blackout":  ("2026-04-20T12:00:00", "2026-04-20T13:00:00")},
        ],
    },

    {
        "name": "Small — tight 5h window, all required",
        "horizon": ("2026-04-21T09:00:00", "2026-04-21T14:00:00"),
        "tasks": [
            {"name": "Math prep",        "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-21T09:00:00", "2026-04-21T11:00:00")},
            {"name": "Essay draft",      "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-21T11:00:00", "2026-04-21T14:00:00")},
            {"name": "Email professor",  "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
        ],
    },

    # ── Medium ───────────────────────────────────────────────
    {
        "name": "Medium — 6 tasks, 10h window, mix of required/optional",
        "horizon": ("2026-04-22T08:00:00", "2026-04-22T18:00:00"),
        "tasks": [
            {"name": "Morning run",   "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-22T08:00:00", "2026-04-22T09:30:00")},
            {"name": "Deep work A",   "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-22T09:00:00", "2026-04-22T13:00:00")},
            {"name": "Lunch break",   "duration_minutes":  60, "priority": "low",      "requirement": "optional"},
            {"name": "Deep work B",   "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-22T14:00:00", "2026-04-22T17:00:00")},
            {"name": "Calls",         "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Review PRs",    "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
        ],
    },

    {
        "name": "Medium — 8 tasks, preferred windows drive placement",
        "horizon": ("2026-04-23T07:00:00", "2026-04-23T21:00:00"),
        "tasks": [
            {"name": "Morning jog",    "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-23T07:00:00", "2026-04-23T08:30:00")},
            {"name": "Client call",    "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-23T10:00:00", "2026-04-23T12:00:00")},
            {"name": "Report draft",   "duration_minutes": 120, "priority": "high",     "requirement": "required"},
            {"name": "Design review",  "duration_minutes":  45, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-04-23T13:00:00", "2026-04-23T15:00:00")},
            {"name": "1:1 meeting",    "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Admin tasks",    "duration_minutes":  30, "priority": "low",      "requirement": "optional"},
            {"name": "Evening workout","duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-23T18:00:00", "2026-04-23T20:00:00")},
            {"name": "Reading",        "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-23T20:00:00", "2026-04-23T21:00:00")},
        ],
    },

    # ── Overloaded ───────────────────────────────────────────
    {
        "name": "Overloaded — 10 tasks in 4h, optionals must drop",
        "horizon": ("2026-04-24T09:00:00", "2026-04-24T13:00:00"),
        "tasks": [
            {"name": "Critical meeting", "duration_minutes": 60,  "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-24T09:00:00", "2026-04-24T10:00:00")},
            {"name": "Prepare slides",   "duration_minutes": 90,  "priority": "high",     "requirement": "required"},
            {"name": "Code review",      "duration_minutes": 60,  "priority": "high",     "requirement": "optional"},
            {"name": "Emails",           "duration_minutes": 30,  "priority": "medium",   "requirement": "optional"},
            {"name": "Lunch",            "duration_minutes": 45,  "priority": "low",      "requirement": "optional"},
            {"name": "Call teammate",    "duration_minutes": 30,  "priority": "medium",   "requirement": "optional"},
            {"name": "Write tests",      "duration_minutes": 60,  "priority": "medium",   "requirement": "optional"},
            {"name": "Deploy",           "duration_minutes": 30,  "priority": "high",     "requirement": "optional"},
            {"name": "Documentation",    "duration_minutes": 45,  "priority": "low",      "requirement": "optional"},
            {"name": "Admin",            "duration_minutes": 20,  "priority": "low",      "requirement": "optional"},
        ],
    },

    # ── Complex constraints ──────────────────────────────────
    {
        "name": "Complex — allowed windows, blackouts, tight preferred",
        "horizon": ("2026-04-25T07:00:00", "2026-04-25T21:00:00"),
        "tasks": [
            {"name": "Morning yoga",  "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-25T07:00:00", "2026-04-25T08:00:00"),
             "allowed":   ("2026-04-25T07:00:00", "2026-04-25T09:00:00")},
            {"name": "Deep focus A",  "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-25T09:00:00", "2026-04-25T12:00:00"),
             "allowed":   ("2026-04-25T08:00:00", "2026-04-25T13:00:00"),
             "blackout":  ("2026-04-25T10:30:00", "2026-04-25T11:00:00")},
            {"name": "Lunch",         "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "allowed":   ("2026-04-25T12:00:00", "2026-04-25T14:00:00")},
            {"name": "Client call",   "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-25T14:00:00", "2026-04-25T15:30:00"),
             "allowed":   ("2026-04-25T13:00:00", "2026-04-25T16:00:00")},
            {"name": "Deep focus B",  "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-25T16:00:00", "2026-04-25T18:00:00"),
             "blackout":  ("2026-04-25T17:00:00", "2026-04-25T17:30:00")},
            {"name": "Evening workout","duration_minutes": 60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-25T18:00:00", "2026-04-25T20:00:00"),
             "allowed":   ("2026-04-25T17:00:00", "2026-04-25T21:00:00")},
            {"name": "Reading",       "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-25T20:00:00", "2026-04-25T21:00:00")},
        ],
    },

    # ── Large ────────────────────────────────────────────────
    {
        "name": "Large — 18 tasks, full day",
        "horizon": ("2026-04-28T07:00:00", "2026-04-28T22:00:00"),
        "tasks": [
            {"name": "Morning jog",        "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-28T07:00:00", "2026-04-28T08:00:00")},
            {"name": "Breakfast",          "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "Email triage",       "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Standup",            "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Feature dev A",      "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-28T09:00:00", "2026-04-28T13:00:00")},
            {"name": "Code review",        "duration_minutes":  45, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-04-28T11:00:00", "2026-04-28T13:00:00")},
            {"name": "Lunch",              "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Feature dev B",      "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-28T13:00:00", "2026-04-28T16:00:00")},
            {"name": "Design sync",        "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Write tests",        "duration_minutes":  60, "priority": "high",     "requirement": "optional"},
            {"name": "Documentation",      "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Retro prep",         "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "1:1 with manager",   "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Infra ticket",       "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Read research paper","duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-28T19:00:00", "2026-04-28T22:00:00")},
            {"name": "Workout",            "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-28T17:30:00", "2026-04-28T19:30:00")},
            {"name": "Side project",       "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-28T20:00:00", "2026-04-28T22:00:00")},
            {"name": "Journal",            "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
        ],
    },

    {
        "name": "Large+ — 25 tasks, critical priority crunch in 12h",
        "horizon": ("2026-04-30T08:00:00", "2026-04-30T20:00:00"),
        "tasks": [
            {"name": "Emergency hotfix",       "duration_minutes":  90, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-30T08:00:00", "2026-04-30T10:00:00")},
            {"name": "Incident post-mortem",   "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-30T10:00:00", "2026-04-30T12:00:00")},
            {"name": "Client demo",            "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-30T14:00:00", "2026-04-30T16:00:00"),
             "allowed":   ("2026-04-30T13:00:00", "2026-04-30T17:00:00")},
            {"name": "Security patch deploy",  "duration_minutes":  45, "priority": "critical", "requirement": "required",
             "preferred": ("2026-04-30T16:00:00", "2026-04-30T18:00:00")},
            {"name": "Board report draft",     "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-30T08:00:00", "2026-04-30T12:00:00")},
            {"name": "Standup",                "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-30T09:00:00", "2026-04-30T09:30:00"),
             "allowed":   ("2026-04-30T09:00:00", "2026-04-30T10:00:00")},
            {"name": "Email triage",           "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Budget review",          "duration_minutes":  60, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-30T11:00:00", "2026-04-30T14:00:00")},
            {"name": "Deploy to prod",         "duration_minutes":  30, "priority": "high",     "requirement": "required"},
            {"name": "Architecture decision",  "duration_minutes":  45, "priority": "high",     "requirement": "required",
             "preferred": ("2026-04-30T13:00:00", "2026-04-30T16:00:00")},
            {"name": "Code review",            "duration_minutes":  60, "priority": "high",     "requirement": "optional"},
            {"name": "Write tests",            "duration_minutes":  45, "priority": "high",     "requirement": "optional"},
            {"name": "Documentation",          "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "1:1 with manager",       "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-04-30T15:00:00", "2026-04-30T17:00:00")},
            {"name": "Team sync",              "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Infra cleanup",          "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Backlog grooming",        "duration_minutes":  30, "priority": "low",      "requirement": "optional"},
            {"name": "Lunch",                  "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Mentoring session",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Read research paper",    "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-30T18:00:00", "2026-04-30T20:00:00")},
            {"name": "Side project",           "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-30T18:00:00", "2026-04-30T20:00:00")},
            {"name": "Review PRs",             "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Sprint planning prep",   "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Admin tasks",            "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "Journal",                "duration_minutes":  15, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-04-30T19:00:00", "2026-04-30T20:00:00")},
        ],
    },

    {
        "name": "Large+ — 28 tasks, 2-day weekend",
        "horizon": ("2026-05-02T08:00:00", "2026-05-03T22:00:00"),
        "tasks": [
            # Saturday
            {"name": "Sat: Morning yoga",     "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-02T08:00:00", "2026-05-02T09:00:00")},
            {"name": "Sat: Grocery run",      "duration_minutes":  60, "priority": "medium",   "requirement": "required",
             "preferred": ("2026-05-02T09:00:00", "2026-05-02T12:00:00"),
             "allowed":   ("2026-05-02T08:00:00", "2026-05-02T18:00:00")},
            {"name": "Sat: House cleaning",   "duration_minutes":  60, "priority": "medium",   "requirement": "optional"},
            {"name": "Sat: Laundry",          "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "Sat: Brunch",           "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-02T10:00:00", "2026-05-02T13:00:00")},
            {"name": "Sat: Read book",        "duration_minutes":  60, "priority": "low",      "requirement": "optional"},
            {"name": "Sat: Personal project", "duration_minutes": 120, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-02T13:00:00", "2026-05-02T17:00:00")},
            {"name": "Sat: Workout",          "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-02T15:00:00", "2026-05-02T18:00:00")},
            {"name": "Sat: Meal prep",        "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-02T16:00:00", "2026-05-02T19:00:00")},
            {"name": "Sat: Call parents",     "duration_minutes":  30, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-02T17:00:00", "2026-05-02T20:00:00")},
            {"name": "Sat: Dinner",           "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-02T19:00:00", "2026-05-02T21:00:00")},
            {"name": "Sat: Movie",            "duration_minutes": 120, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-02T20:00:00", "2026-05-02T23:30:00"),
             "allowed":   ("2026-05-02T19:00:00", "2026-05-03T00:00:00")},
            {"name": "Sat: Journal",          "duration_minutes":  20, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-02T22:00:00", "2026-05-02T23:30:00")},
            # Sunday
            {"name": "Sun: Morning run",      "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-03T08:00:00", "2026-05-03T09:30:00")},
            {"name": "Sun: Meditation",       "duration_minutes":  20, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-03T09:00:00", "2026-05-03T10:00:00")},
            {"name": "Sun: Brunch",           "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-03T10:00:00", "2026-05-03T12:00:00")},
            {"name": "Sun: Study session",    "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-03T11:00:00", "2026-05-03T15:00:00")},
            {"name": "Sun: Review notes",     "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-03T13:00:00", "2026-05-03T16:00:00")},
            {"name": "Sun: Workout",          "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-03T15:00:00", "2026-05-03T17:00:00")},
            {"name": "Sun: Side project",     "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-03T13:00:00", "2026-05-03T17:00:00")},
            {"name": "Sun: Dinner w/ family", "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-03T17:00:00", "2026-05-03T20:00:00"),
             "allowed":   ("2026-05-03T16:00:00", "2026-05-03T21:00:00")},
            {"name": "Sun: Prep work week",   "duration_minutes":  45, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-03T19:00:00", "2026-05-03T22:00:00")},
            {"name": "Sun: Read book",        "duration_minutes":  60, "priority": "low",      "requirement": "optional"},
            {"name": "Sun: Call friend",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-03T18:00:00", "2026-05-03T21:00:00")},
            {"name": "Sun: Grocery run",      "duration_minutes":  45, "priority": "medium",   "requirement": "required",
             "allowed":   ("2026-05-03T09:00:00", "2026-05-03T18:00:00")},
            {"name": "Sun: Pack bag",         "duration_minutes":  15, "priority": "medium",   "requirement": "required",
             "preferred": ("2026-05-03T20:00:00", "2026-05-03T22:00:00")},
            {"name": "Sun: Wind down",        "duration_minutes":  30, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-03T21:00:00", "2026-05-03T22:00:00")},
            {"name": "Sun: Journal",          "duration_minutes":  20, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-03T21:00:00", "2026-05-03T22:00:00")},
        ],
    },

    # ── XL multi-day ─────────────────────────────────────────
    {
        "name": "XL — 35 tasks, 3-day sprint (Mon–Wed) with deadline pressure",
        "horizon": ("2026-05-11T07:00:00", "2026-05-13T22:00:00"),
        "tasks": [
            # Monday — kickoff
            {"name": "Mon: Morning run",       "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-11T07:00:00", "2026-05-11T08:00:00")},
            {"name": "Mon: Breakfast",         "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "Mon: Email triage",      "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Mon: Standup",           "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-11T09:00:00", "2026-05-11T10:00:00")},
            {"name": "Mon: Sprint kickoff",    "duration_minutes":  90, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-11T10:00:00", "2026-05-11T12:00:00")},
            {"name": "Mon: Lunch",             "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Mon: Feature X dev",     "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-11T13:00:00", "2026-05-11T17:00:00")},
            {"name": "Mon: Code review",       "duration_minutes":  45, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-05-11T11:00:00", "2026-05-11T14:00:00")},
            {"name": "Mon: Workout",           "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-11T18:00:00", "2026-05-11T20:00:00")},
            {"name": "Mon: Side project",      "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-11T20:00:00", "2026-05-11T22:00:00")},
            {"name": "Mon: Journal",           "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
            # Tuesday — implementation
            {"name": "Tue: Morning jog",       "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-12T07:00:00", "2026-05-12T08:00:00")},
            {"name": "Tue: Email triage",      "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Standup",           "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-12T09:00:00", "2026-05-12T10:00:00")},
            {"name": "Tue: Feature X testing", "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-12T09:00:00", "2026-05-12T13:00:00")},
            {"name": "Tue: Bug fixes",         "duration_minutes":  60, "priority": "high",     "requirement": "required"},
            {"name": "Tue: Design review",     "duration_minutes":  45, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-05-12T14:00:00", "2026-05-12T16:00:00")},
            {"name": "Tue: 1:1 with PM",       "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Documentation",     "duration_minutes":  60, "priority": "medium",   "requirement": "optional"},
            {"name": "Tue: Security scan",     "duration_minutes":  30, "priority": "high",     "requirement": "optional"},
            {"name": "Tue: Gym",               "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-12T18:00:00", "2026-05-12T20:00:00")},
            {"name": "Tue: Read paper",        "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-12T20:00:00", "2026-05-12T22:00:00")},
            # Wednesday — deadline day
            {"name": "Wed: Email triage",      "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Wed: Standup",           "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-13T09:00:00", "2026-05-13T10:00:00")},
            {"name": "Wed: Final testing",     "duration_minutes":  90, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-13T09:00:00", "2026-05-13T12:00:00")},
            {"name": "Wed: Demo prep",         "duration_minutes":  60, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-13T10:00:00", "2026-05-13T13:00:00")},
            {"name": "Wed: Deployment",        "duration_minutes":  45, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-13T14:00:00", "2026-05-13T16:00:00"),
             "allowed":   ("2026-05-13T13:00:00", "2026-05-13T17:00:00")},
            {"name": "Wed: Post-deploy check", "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-13T15:00:00", "2026-05-13T17:00:00")},
            {"name": "Wed: Client demo",       "duration_minutes":  90, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-13T16:00:00", "2026-05-13T18:00:00"),
             "allowed":   ("2026-05-13T15:00:00", "2026-05-13T19:00:00")},
            {"name": "Wed: Retro",             "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Wed: Team celebration",  "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-13T18:00:00", "2026-05-13T20:00:00")},
            {"name": "Wed: Wrap-up emails",    "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Wed: Evening walk",      "duration_minutes":  30, "priority": "low",      "requirement": "optional"},
            {"name": "Wed: Admin tasks",       "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            {"name": "Wed: Journal",           "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
        ],
    },

    {
        "name": "XL — 45 tasks, 4-day Thu–Sun (work wind-down + weekend)",
        "horizon": ("2026-05-14T07:00:00", "2026-05-17T23:00:00"),
        "tasks": [
            # Thursday
            {"name": "Thu: Email triage",       "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Standup",             "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-14T09:00:00", "2026-05-14T10:00:00")},
            {"name": "Thu: Feature C",           "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-14T09:00:00", "2026-05-14T13:00:00")},
            {"name": "Thu: Architecture review", "duration_minutes":  60, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-05-14T10:00:00", "2026-05-14T12:00:00")},
            {"name": "Thu: 1:1 with manager",    "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Write tests",         "duration_minutes":  60, "priority": "high",     "requirement": "optional"},
            {"name": "Thu: Deployment prep",     "duration_minutes":  45, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-14T15:00:00", "2026-05-14T17:00:00")},
            {"name": "Thu: Team sync",           "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Thu: Gym",                 "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-14T17:30:00", "2026-05-14T19:30:00")},
            {"name": "Thu: Read book",           "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Thu: Journal",             "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
            # Friday
            {"name": "Fri: Email triage",        "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Fri: Standup",             "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-15T09:00:00", "2026-05-15T10:00:00")},
            {"name": "Fri: Q2 planning",         "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-15T09:00:00", "2026-05-15T13:00:00")},
            {"name": "Fri: Weekly report",       "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-15T13:00:00", "2026-05-15T16:00:00")},
            {"name": "Fri: Code review",         "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Fri: Backlog grooming",    "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Fri: Team happy hour",     "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-15T17:00:00", "2026-05-15T19:30:00")},
            {"name": "Fri: Dinner out",          "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-15T19:30:00", "2026-05-15T22:00:00")},
            {"name": "Fri: Side project",        "duration_minutes":  60, "priority": "low",      "requirement": "optional"},
            {"name": "Fri: Journal",             "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
            # Saturday
            {"name": "Sat: Morning yoga",        "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-16T07:00:00", "2026-05-16T09:00:00")},
            {"name": "Sat: Grocery run",         "duration_minutes":  60, "priority": "medium",   "requirement": "required",
             "preferred": ("2026-05-16T10:00:00", "2026-05-16T12:00:00"),
             "allowed":   ("2026-05-16T09:00:00", "2026-05-16T17:00:00")},
            {"name": "Sat: House cleaning",      "duration_minutes":  60, "priority": "medium",   "requirement": "optional"},
            {"name": "Sat: Car maintenance",     "duration_minutes":  90, "priority": "medium",   "requirement": "required",
             "allowed":   ("2026-05-16T09:00:00", "2026-05-16T17:00:00")},
            {"name": "Sat: Brunch",              "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-16T10:00:00", "2026-05-16T13:00:00")},
            {"name": "Sat: Personal project",    "duration_minutes": 120, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-16T14:00:00", "2026-05-16T18:00:00")},
            {"name": "Sat: Workout",             "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-16T15:00:00", "2026-05-16T18:00:00")},
            {"name": "Sat: Call parents",        "duration_minutes":  30, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-16T17:00:00", "2026-05-16T20:00:00")},
            {"name": "Sat: Meal prep",           "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-16T16:00:00", "2026-05-16T19:00:00")},
            {"name": "Sat: Dinner",              "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-16T19:00:00", "2026-05-16T21:00:00")},
            {"name": "Sat: Movie",               "duration_minutes": 120, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-16T20:00:00", "2026-05-16T23:00:00")},
            # Sunday
            {"name": "Sun: Morning run",         "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-17T07:00:00", "2026-05-17T09:00:00")},
            {"name": "Sun: Meditation",          "duration_minutes":  20, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-17T08:00:00", "2026-05-17T10:00:00")},
            {"name": "Sun: Brunch",              "duration_minutes":  45, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-17T10:00:00", "2026-05-17T12:00:00")},
            {"name": "Sun: Study session",       "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-17T10:00:00", "2026-05-17T14:00:00")},
            {"name": "Sun: Review notes",        "duration_minutes":  45, "priority": "medium",   "requirement": "optional"},
            {"name": "Sun: Workout",             "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-17T15:00:00", "2026-05-17T17:00:00")},
            {"name": "Sun: Side project",        "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-17T13:00:00", "2026-05-17T17:00:00")},
            {"name": "Sun: Grocery run",         "duration_minutes":  30, "priority": "medium",   "requirement": "required",
             "allowed":   ("2026-05-17T10:00:00", "2026-05-17T18:00:00")},
            {"name": "Sun: Dinner w/ family",    "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-17T17:00:00", "2026-05-17T20:00:00"),
             "allowed":   ("2026-05-17T16:00:00", "2026-05-17T21:00:00")},
            {"name": "Sun: Prep work week",      "duration_minutes":  45, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-17T20:00:00", "2026-05-17T23:00:00")},
            {"name": "Sun: Pack bag",            "duration_minutes":  15, "priority": "medium",   "requirement": "required",
             "preferred": ("2026-05-17T21:00:00", "2026-05-17T23:00:00")},
            {"name": "Sun: Wind down",           "duration_minutes":  30, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-17T21:30:00", "2026-05-17T23:00:00")},
            {"name": "Sun: Journal",             "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
        ],
    },

    {
        "name": "XL — 55 tasks, 6-day work week Mon–Sat",
        "horizon": ("2026-05-18T07:00:00", "2026-05-23T22:00:00"),
        "tasks": [
            # Monday
            {"name": "Mon: Morning run",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-18T07:00:00", "2026-05-18T08:00:00")},
            {"name": "Mon: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Mon: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-18T09:00:00", "2026-05-18T10:00:00")},
            {"name": "Mon: Sprint planning",  "duration_minutes":  60, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-18T10:00:00", "2026-05-18T12:00:00")},
            {"name": "Mon: Feature dev",      "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-18T13:00:00", "2026-05-18T17:00:00")},
            {"name": "Mon: Code review",      "duration_minutes":  45, "priority": "high",     "requirement": "optional"},
            {"name": "Mon: Workout",          "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-18T18:00:00", "2026-05-18T20:00:00")},
            {"name": "Mon: Side project",     "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-18T20:00:00", "2026-05-18T22:00:00")},
            # Tuesday
            {"name": "Tue: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-19T09:00:00", "2026-05-19T10:00:00")},
            {"name": "Tue: Feature dev",      "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-19T09:00:00", "2026-05-19T13:00:00")},
            {"name": "Tue: Design doc",       "duration_minutes":  60, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-05-19T14:00:00", "2026-05-19T16:00:00")},
            {"name": "Tue: 1:1",              "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Write tests",      "duration_minutes":  60, "priority": "high",     "requirement": "optional"},
            {"name": "Tue: Gym",              "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-19T18:00:00", "2026-05-19T20:00:00")},
            {"name": "Tue: Read paper",       "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Tue: Admin",            "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            # Wednesday
            {"name": "Wed: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Wed: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-20T09:00:00", "2026-05-20T10:00:00")},
            {"name": "Wed: Client demo",      "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-20T10:00:00", "2026-05-20T12:00:00")},
            {"name": "Wed: Bug triage",       "duration_minutes":  45, "priority": "high",     "requirement": "required"},
            {"name": "Wed: Hotfix",           "duration_minutes":  60, "priority": "critical", "requirement": "required"},
            {"name": "Wed: Docs update",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Wed: Team lunch",       "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-20T12:00:00", "2026-05-20T14:00:00")},
            {"name": "Wed: Security review",  "duration_minutes":  45, "priority": "high",     "requirement": "optional"},
            {"name": "Wed: Evening run",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-20T18:00:00", "2026-05-20T20:00:00")},
            {"name": "Wed: Journal",          "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
            # Thursday
            {"name": "Thu: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-21T09:00:00", "2026-05-21T10:00:00")},
            {"name": "Thu: Feature C",        "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-21T09:00:00", "2026-05-21T13:00:00")},
            {"name": "Thu: Retro",            "duration_minutes":  45, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Deployment",       "duration_minutes":  30, "priority": "high",     "requirement": "required"},
            {"name": "Thu: Architecture call","duration_minutes":  60, "priority": "high",     "requirement": "optional"},
            {"name": "Thu: Call parent",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Thu: Gym",              "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-21T17:30:00", "2026-05-21T19:30:00")},
            # Friday
            {"name": "Fri: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Fri: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required",
             "allowed":   ("2026-05-22T09:00:00", "2026-05-22T10:00:00")},
            {"name": "Fri: Deep work",        "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-22T09:00:00", "2026-05-22T13:00:00")},
            {"name": "Fri: Weekly report",    "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-22T13:00:00", "2026-05-22T16:00:00")},
            {"name": "Fri: Team happy hour",  "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-22T17:00:00", "2026-05-22T19:00:00")},
            {"name": "Fri: Dinner",           "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-22T19:00:00", "2026-05-22T21:00:00")},
            {"name": "Fri: Read book",        "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Fri: Journal",          "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
            # Saturday
            {"name": "Sat: Morning yoga",     "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-23T07:00:00", "2026-05-23T09:00:00")},
            {"name": "Sat: Grocery run",      "duration_minutes":  60, "priority": "medium",   "requirement": "required",
             "preferred": ("2026-05-23T09:00:00", "2026-05-23T12:00:00"),
             "allowed":   ("2026-05-23T08:00:00", "2026-05-23T17:00:00")},
            {"name": "Sat: House cleaning",   "duration_minutes":  60, "priority": "medium",   "requirement": "optional"},
            {"name": "Sat: Workout",          "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-23T10:00:00", "2026-05-23T12:00:00")},
            {"name": "Sat: Brunch",           "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-23T11:00:00", "2026-05-23T14:00:00")},
            {"name": "Sat: Personal project", "duration_minutes": 120, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-23T14:00:00", "2026-05-23T18:00:00")},
            {"name": "Sat: Call friends",     "duration_minutes":  45, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-23T16:00:00", "2026-05-23T19:00:00")},
            {"name": "Sat: Meal prep",        "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-23T17:00:00", "2026-05-23T20:00:00")},
            {"name": "Sat: Dinner",           "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-23T19:00:00", "2026-05-23T21:00:00")},
            {"name": "Sat: Journal",          "duration_minutes":  20, "priority": "low",      "requirement": "optional"},
        ],
    },

    # ── Very large ───────────────────────────────────────────
    {
        "name": "Very large — 40 tasks over 1 week",
        "horizon": ("2026-05-04T07:00:00", "2026-05-08T22:00:00"),  # Mon–Fri
        "tasks": [
            # Monday
            {"name": "Mon: Morning run",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-04T07:00:00", "2026-05-04T08:00:00")},
            {"name": "Mon: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Mon: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Mon: Sprint planning",  "duration_minutes":  60, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-04T10:00:00", "2026-05-04T12:00:00")},
            {"name": "Mon: Feature A",        "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-04T13:00:00", "2026-05-04T17:00:00")},
            {"name": "Mon: Code review",      "duration_minutes":  45, "priority": "high",     "requirement": "optional"},
            {"name": "Mon: Workout",          "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-04T17:30:00", "2026-05-04T19:30:00")},
            {"name": "Mon: Side project",     "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-04T20:00:00", "2026-05-04T22:00:00")},
            # Tuesday
            {"name": "Tue: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Tue: Feature B",        "duration_minutes": 120, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-05T09:00:00", "2026-05-05T13:00:00")},
            {"name": "Tue: Design doc",       "duration_minutes":  60, "priority": "high",     "requirement": "optional",
             "preferred": ("2026-05-05T14:00:00", "2026-05-05T16:00:00")},
            {"name": "Tue: 1:1",              "duration_minutes":  30, "priority": "medium",   "requirement": "required"},
            {"name": "Tue: Gym",              "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-05T17:30:00", "2026-05-05T19:30:00")},
            {"name": "Tue: Read paper",       "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-05T20:00:00", "2026-05-05T22:00:00")},
            # Wednesday
            {"name": "Wed: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Wed: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Wed: Client demo",      "duration_minutes":  60, "priority": "critical", "requirement": "required",
             "preferred": ("2026-05-06T10:00:00", "2026-05-06T12:00:00")},
            {"name": "Wed: Bug triage",       "duration_minutes":  45, "priority": "high",     "requirement": "required"},
            {"name": "Wed: Hotfix",           "duration_minutes":  60, "priority": "critical", "requirement": "required"},
            {"name": "Wed: Docs update",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Wed: Team lunch",       "duration_minutes":  60, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-06T12:00:00", "2026-05-06T13:30:00")},
            {"name": "Wed: Security review",  "duration_minutes":  45, "priority": "high",     "requirement": "optional"},
            {"name": "Wed: Evening run",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-06T18:00:00", "2026-05-06T20:00:00")},
            # Thursday
            {"name": "Thu: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Thu: Feature C",        "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-07T09:00:00", "2026-05-07T13:00:00")},
            {"name": "Thu: Retro",            "duration_minutes":  45, "priority": "medium",   "requirement": "required"},
            {"name": "Thu: Deployment",       "duration_minutes":  30, "priority": "high",     "requirement": "required"},
            {"name": "Thu: Call parent",      "duration_minutes":  30, "priority": "medium",   "requirement": "optional"},
            {"name": "Thu: Grocery run",      "duration_minutes":  45, "priority": "low",      "requirement": "optional"},
            {"name": "Thu: Gym",              "duration_minutes":  60, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-07T17:30:00", "2026-05-07T19:30:00")},
            # Friday
            {"name": "Fri: Email triage",     "duration_minutes":  20, "priority": "medium",   "requirement": "required"},
            {"name": "Fri: Standup",          "duration_minutes":  15, "priority": "high",     "requirement": "required"},
            {"name": "Fri: Deep work",        "duration_minutes": 120, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-08T09:00:00", "2026-05-08T13:00:00")},
            {"name": "Fri: Report",           "duration_minutes":  90, "priority": "high",     "requirement": "required",
             "preferred": ("2026-05-08T13:00:00", "2026-05-08T16:00:00")},
            {"name": "Fri: Team happy hour",  "duration_minutes":  90, "priority": "medium",   "requirement": "optional",
             "preferred": ("2026-05-08T17:00:00", "2026-05-08T19:00:00")},
            {"name": "Fri: Side project",     "duration_minutes":  90, "priority": "low",      "requirement": "optional",
             "preferred": ("2026-05-08T20:00:00", "2026-05-08T22:00:00")},
            {"name": "Fri: Journal",          "duration_minutes":  15, "priority": "low",      "requirement": "optional"},
        ],
    },
]
