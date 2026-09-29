from __future__ import annotations
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field

UUID = str
ISODateTimeString = str
ISODateString = str
TimeString = str
HexColor = str

PriorityLevel = Literal["low", "medium", "high", "critical"]
InviteStatus = Literal["pending", "accepted", "declined", "tentative"]
ReminderMethod = Literal["push", "email", "sms"]
RecurrenceUnit = Literal["daily", "weekly", "monthly", "custom"]
Flexibility = Literal["locked", "movable"]
Requirement = Literal["required", "optional"]


class EventAttendee(BaseModel):
    id: UUID
    event_id: UUID
    user_id: Optional[UUID] = None
    email: str
    name: Optional[str] = None
    status: InviteStatus
    invited_at: ISODateTimeString
    responded_at: Optional[ISODateTimeString] = None


class TimeWindow(BaseModel):
    kind: Literal["absolute", "weekly"]
    # Absolute window fields
    start: Optional[ISODateTimeString] = None
    end: Optional[ISODateTimeString] = None
    # Weekly recurring window fields
    days_of_week: Optional[list[int]] = None
    time_start: Optional[TimeString] = None
    time_end: Optional[TimeString] = None


class SplittableConfig(BaseModel):
    is_splittable: bool
    min_split_minutes: Optional[int] = None
    max_split_minutes: Optional[int] = None


class SchedulingConstraints(BaseModel):
    allowed_windows: Optional[list[TimeWindow]] = None
    blackout_windows: Optional[list[TimeWindow]] = None
    earliest_start: Optional[ISODateTimeString] = None
    latest_end: Optional[ISODateTimeString] = None
    preferred_windows: Optional[list[TimeWindow]] = None
    cooldown_hours: Optional[float] = None
    splittable: Optional[SplittableConfig] = None


class CalendarItemBase(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    color: Optional[HexColor] = None
    priority: PriorityLevel
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    attendees: Optional[list[EventAttendee]] = None
    flexibility: Flexibility
    requirement: Requirement
    nlp_source_text: Optional[str] = None
    is_completed: bool
    completed_at: Optional[ISODateTimeString] = None
    created_at: ISODateTimeString
    updated_at: ISODateTimeString


class RecurrenceRule(BaseModel):
    id: UUID
    item_id: UUID
    unit: RecurrenceUnit
    interval: int
    days_of_week: Optional[list[int]] = None
    time_start: Optional[TimeString] = None
    time_end: Optional[TimeString] = None
    recurrence_start: ISODateString
    recurrence_end: Optional[ISODateString] = None
    excluded_dates: Optional[list[ISODateString]] = None
    created_at: ISODateTimeString


class FixedEvent(CalendarItemBase):
    kind: Literal["fixed_event"] = "fixed_event"
    start: ISODateTimeString
    end: ISODateTimeString
    recurrence_rule: Optional[RecurrenceRule] = None


class Task(CalendarItemBase):
    kind: Literal["task"] = "task"
    duration_minutes: int
    constraints: Optional[SchedulingConstraints] = None
    task_type: Optional[str] = None


CalendarItem = Annotated[
    Union[FixedEvent, Task],
    Field(discriminator="kind")
]


class ScheduledBlock(BaseModel):
    id: UUID
    item_id: UUID
    user_id: UUID
    start_time: ISODateTimeString
    end_time: ISODateTimeString
    placed_by: Literal["scheduler", "user"]
    created_at: ISODateTimeString
    updated_at: ISODateTimeString


class FrequencyConfig(BaseModel):
    unit: Literal["daily", "weekly"]
    times: int


class RepeatTemplate(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    task_type: Optional[str] = None
    duration_minutes: int
    priority: PriorityLevel
    color: Optional[HexColor] = None
    frequency: FrequencyConfig
    eligible_days_of_week: Optional[list[int]] = None
    constraints: Optional[SchedulingConstraints] = None
    requirement: Requirement
    flexibility: Flexibility
    active_from: ISODateString
    active_to: Optional[ISODateString] = None
    created_at: ISODateTimeString
    updated_at: ISODateTimeString


class Reminder(BaseModel):
    id: UUID
    user_id: UUID
    target_type: Literal["calendar_item", "scheduled_block"]
    target_id: UUID
    method: ReminderMethod
    minutes_before: int
    is_sent: bool
    sent_at: Optional[ISODateTimeString] = None
    created_at: ISODateTimeString


class GoalTarget(BaseModel):
    unit: Literal["minutes", "count"]
    amount: int
    per: Literal["day", "week", "month"]


class Goal(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    target: GoalTarget
    linked_repeat_template_id: Optional[UUID] = None
    is_active: bool
    created_at: ISODateTimeString
    updated_at: ISODateTimeString


class UserAvailabilityProfile(BaseModel):
    user_id: UUID
    global_blackouts: Optional[list[TimeWindow]] = None
    global_preferred: Optional[list[TimeWindow]] = None
    timezone: Optional[str] = None
    updated_at: ISODateTimeString
