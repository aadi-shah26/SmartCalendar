from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.models import Task, SchedulingConstraints, TimeWindow
from app.scheduler.intervals import Interval
from app.scheduler.times import parse_iso_to_ms
from app.scheduler.tasks import sort_scheduling_tasks
from app.scheduler.cp_sat_scheduler import schedule_tasks_cpsat
from app.scheduler.heuristic_scheduler import schedule_tasks_greedy

load_dotenv()

app = FastAPI(
    title="Smart Calendar Scheduler API",
    description=(
        "## Endpoints\n\n"
        "| Endpoint | Scheduler |\n"
        "|---|---|\n"
        "| `POST /schedule/cpsat` | **CP-SAT (Recommended)** |\n"
        "| `POST /schedule/heuristic` | Greedy heuristic |\n\n"
        "## How to call a scheduler\n\n"
        "Both endpoints accept the same `ScheduleRequest` body and return the same `ScheduleResponse` shape.\n\n"
        "**Minimum required fields per task:**\n"
        "```json\n"
        "{\n"
        "  \"kind\": \"task\",\n"
        "  \"id\": \"<uuid>\",\n"
        "  \"user_id\": \"<uuid>\",\n"
        "  \"name\": \"My Task\",\n"
        "  \"priority\": \"high\",\n"
        "  \"flexibility\": \"movable\",\n"
        "  \"requirement\": \"required\",\n"
        "  \"is_completed\": false,\n"
        "  \"created_at\": \"2025-06-01T00:00:00\",\n"
        "  \"updated_at\": \"2025-06-01T00:00:00\",\n"
        "  \"duration_minutes\": 60\n"
        "}\n"
        "```\n\n"
        "Add `constraints` to restrict when the task can be placed. "
        "Omit it to let the scheduler place the task anywhere in the horizon.\n\n"
        "## Key field reference\n\n"
        "| Field | Values | Effect |\n"
        "|---|---|---|\n"
        "| `kind` | `task` | **Required.** Discriminator — must always be `\"task\"` |\n"
        "| `flexibility` | `movable` / `locked` | `movable` — scheduler places it freely; `locked` — already fixed, exclude from the request |\n"
        "| `requirement` | `required` / `optional` | `required` — must be placed or the response status signals failure; `optional` — skipped if no room |\n"
        "| `priority` | `low` / `medium` / `high` / `critical` | Higher priority tasks are favoured when multiple slots score equally |\n"
        "| `duration_minutes` | integer | Length of the time block to reserve |\n"
        "| `constraints` | `SchedulingConstraints` | Optional. Restricts allowed time windows, sets blackouts, preferred times, and deadline bounds |\n\n"
        "## TimeWindow format\n\n"
        "Used in `allowed_windows`, `blackout_windows`, and `preferred_windows`.\n\n"
        "**Absolute** — pin to exact datetimes:\n"
        "```json\n"
        "{ \"kind\": \"absolute\", \"start\": \"2025-06-10T09:00:00\", \"end\": \"2025-06-10T17:00:00\" }\n"
        "```\n\n"
        "**Weekly** — repeat on chosen days each week:\n"
        "```json\n"
        "{ \"kind\": \"weekly\", \"days_of_week\": [1,2,3,4,5], \"time_start\": \"09:00\", \"time_end\": \"17:00\" }\n"
        "```\n"
        "`days_of_week` uses Python weekday integers: 0 = Monday … 6 = Sunday.\n\n"
        "## All datetimes are ISO 8601\n\n"
        "Use `YYYY-MM-DDTHH:MM:SS` throughout — `horizon_start`, `horizon_end`, `earliest_start`, `latest_end`, "
        "and all absolute window `start`/`end` values.\n"
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Request / Response schemas
# ──────────────────────────────────────────────

_TASK_EXAMPLE = {
    "id": "task-uuid-001",
    "user_id": "user-uuid-abc",
    "name": "Write project report",
    "description": "Draft the Q2 project summary",
    "color": "#4A90E2",
    "priority": "high",
    "location": None,
    "meeting_link": None,
    "attendees": None,
    "flexibility": "movable",
    "requirement": "required",
    "nlp_source_text": None,
    "is_completed": False,
    "completed_at": None,
    "created_at": "2025-06-01T00:00:00",
    "updated_at": "2025-06-01T00:00:00",
    "kind": "task",
    "duration_minutes": 90,
    "task_type": "deep_work",
    "constraints": {
        "earliest_start": "2025-06-10T08:00:00",
        "latest_end": "2025-06-10T18:00:00",
        "allowed_windows": [
            {
                "kind": "weekly",
                "days_of_week": [1, 2, 3, 4, 5],
                "time_start": "09:00",
                "time_end": "17:00",
            }
        ],
        "blackout_windows": None,
        "preferred_windows": [
            {
                "kind": "weekly",
                "days_of_week": [1, 2, 3],
                "time_start": "09:00",
                "time_end": "12:00",
            }
        ],
        "cooldown_hours": None,
        "splittable": None,
    },
}


class ScheduleRequest(BaseModel):
    """
    Input to any scheduler endpoint.

    Send a list of tasks and the planning horizon. The scheduler will find
    non-overlapping placements that respect each task's constraints.
    """

    tasks: list[Task] = Field(
        ...,
        description=(
            "Tasks to schedule. Each task must have `kind: 'task'` (discriminator field). "
            "Fields that most affect scheduling:\n\n"
            "- `duration_minutes` — how long the block should be\n"
            "- `flexibility` — `movable` (scheduler can place it anywhere) or `locked` "
            "(task is treated as already fixed; pass it as a `fixed_event` instead)\n"
            "- `requirement` — `required` tasks must be placed or the solver reports INFEASIBLE; "
            "`optional` tasks are placed only if room exists\n"
            "- `priority` — `low | medium | high | critical`; higher priority tasks are "
            "scored higher when multiple slots tie\n"
            "- `constraints` — see `SchedulingConstraints` for per-task windows, blackouts, "
            "preferred times, and cooldowns"
        ),
        json_schema_extra={"example": [_TASK_EXAMPLE]},
    )
    horizon_start: str = Field(
        ...,
        description=(
            "ISO 8601 datetime marking the **start** of the planning window. "
            "No task will be placed before this time.\n\n"
            "Example: `\"2025-06-10T00:00:00\"`"
        ),
        json_schema_extra={"example": "2025-06-10T00:00:00"},
    )
    horizon_end: str = Field(
        ...,
        description=(
            "ISO 8601 datetime marking the **end** of the planning window. "
            "No task will be placed after this time.\n\n"
            "Example: `\"2025-06-17T23:59:59\"`"
        ),
        json_schema_extra={"example": "2025-06-17T23:59:59"},
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "horizon_start": "2025-06-10T00:00:00",
                "horizon_end": "2025-06-17T23:59:59",
                "tasks": [_TASK_EXAMPLE],
            }
        }
    }


class PlacementResponse(BaseModel):
    """A single scheduled task placement."""

    task_id: str = Field(..., description="UUID of the scheduled task.")
    task_name: str = Field(..., description="Display name of the task.")
    start: str = Field(..., description="ISO 8601 datetime when the block starts.")
    end: str = Field(..., description="ISO 8601 datetime when the block ends.")


class ScheduleResponse(BaseModel):
    """
    Scheduler output: the list of placed tasks plus a solver status string.

    Tasks that could not be placed (e.g. optional tasks with no room) are
    simply omitted from `placements` — they do **not** cause an error.
    Only unplaceable `required` tasks cause a non-OK status.
    """

    status: str = Field(
        ...,
        description=(
            "Solver exit status.\n\n"
            "**CP-SAT values:**\n"
            "- `OPTIMAL` — provably best schedule found\n"
            "- `FEASIBLE (time limit hit)` — good schedule found within 30 s time limit "
            "(occurs on very large inputs)\n"
            "- `INFEASIBLE` — one or more `required` tasks could not be placed; "
            "check constraints or widen the horizon\n"
            "- `UNKNOWN` — solver ran out of time before finding any solution\n\n"
            "**Heuristic values:**\n"
            "- `GREEDY_OK` — all `required` tasks were placed\n"
            "- `GREEDY_PARTIAL (N required unplaced)` — N required tasks had no valid slot"
        ),
    )
    placements: list[PlacementResponse] = Field(
        ...,
        description="Ordered list of task placements, sorted by start time.",
    )


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _build_horizon(request: ScheduleRequest) -> Interval:
    return Interval(
        start_ms=parse_iso_to_ms(request.horizon_start),
        end_ms=parse_iso_to_ms(request.horizon_end),
    )


def _to_placement_responses(placements) -> list[PlacementResponse]:
    sorted_placements = sorted(placements, key=lambda p: p.interval.start_ms)
    return [
        PlacementResponse(
            task_id=p.task.id,
            task_name=p.task.name,
            start=datetime.fromtimestamp(p.interval.start_ms / 1000).isoformat(),
            end=datetime.fromtimestamp(p.interval.end_ms / 1000).isoformat(),
        )
        for p in sorted_placements
    ]


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/health", tags=["Meta"], summary="Health check")
def health():
    """Returns `{\"status\": \"ok\"}` when the server is running."""
    return {"status": "ok"}


@app.post(
    "/schedule/cpsat",
    response_model=ScheduleResponse,
    tags=["Scheduling"],
    summary="Schedule tasks — CP-SAT (use this)",
    description=(
        "**Recommended scheduler.** Pass a list of tasks and a planning horizon; "
        "returns a non-overlapping schedule that respects every task's constraints.\n\n"
        "### Request\n\n"
        "- `horizon_start` / `horizon_end` — the window the scheduler may place tasks within. "
        "No task will be placed outside these bounds.\n"
        "- `tasks` — list of task objects. Every task needs at minimum: "
        "`kind`, `id`, `user_id`, `name`, `priority`, `flexibility`, `requirement`, "
        "`is_completed`, `created_at`, `updated_at`, and `duration_minutes`.\n"
        "- `constraints` is optional. Omit it to allow placement anywhere in the horizon. "
        "Supply it to restrict allowed windows, add blackouts, set a hard deadline "
        "(`latest_end`), or mark preferred times.\n\n"
        "### Response\n\n"
        "- `status` — `OPTIMAL` (best possible schedule found) or "
        "`FEASIBLE (time limit hit)` (valid schedule, solver stopped early on very large inputs). "
        "If a `required` task cannot fit given its constraints, status is `INFEASIBLE` and "
        "`placements` is empty — fix by widening the task's `allowed_windows`, relaxing "
        "`earliest_start`/`latest_end`, or extending `horizon_end`.\n"
        "- `placements` — list of placed tasks sorted by start time. "
        "Optional tasks that could not be fit are silently omitted."
    ),
)
def schedule_cpsat(request: ScheduleRequest) -> ScheduleResponse:
    horizon = _build_horizon(request)
    scheduling_tasks = sort_scheduling_tasks(request.tasks, horizon)
    placements, status = schedule_tasks_cpsat(scheduling_tasks, horizon)
    return ScheduleResponse(status=status, placements=_to_placement_responses(placements))


@app.post(
    "/schedule/heuristic",
    response_model=ScheduleResponse,
    tags=["Scheduling"],
    summary="Schedule tasks — Greedy Heuristic",
    description=(
        "Greedy heuristic scheduler. Accepts the same request shape as `/schedule/cpsat` "
        "and returns the same response shape.\n\n"
        "### Request\n\n"
        "Identical to `/schedule/cpsat` — see that endpoint for full field details.\n\n"
        "### Response\n\n"
        "- `status` — `GREEDY_OK` (all `required` tasks placed) or "
        "`GREEDY_PARTIAL (N required unplaced)` (N required tasks had no valid slot given "
        "their constraints).\n"
        "- `placements` — list of placed tasks sorted by start time. "
        "Optional tasks that could not be fit are silently omitted.\n\n"
        "Prefer `/schedule/cpsat` for accurate results. "
        "Use this endpoint when you need a near-instant response and can tolerate a less optimal schedule."
    ),
)
def schedule_heuristic(request: ScheduleRequest) -> ScheduleResponse:
    horizon = _build_horizon(request)
    scheduling_tasks = sort_scheduling_tasks(request.tasks, horizon)
    placements, status = schedule_tasks_greedy(scheduling_tasks, horizon)
    return ScheduleResponse(status=status, placements=_to_placement_responses(placements))
