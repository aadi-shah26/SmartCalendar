from datetime import datetime
from app.models import Task, TimeWindow
from .intervals import Interval
from .interval_set import IntervalSet
from .times import parse_iso_to_ms, parse_time_string_to_minutes, start_of_day_ms

_MS_PER_DAY = 24 * 60 * 60 * 1000


def _window_to_interval_list(window: TimeWindow, horizon: Interval) -> list[Interval]:
    result: list[Interval] = []

    if window.kind == "absolute":
        if not window.start or not window.end:
            return []
        start = parse_iso_to_ms(window.start)
        end = parse_iso_to_ms(window.end)
        clipped_start = max(start, horizon.start_ms)
        clipped_end = min(end, horizon.end_ms)
        if clipped_start < clipped_end:
            result.append(Interval(start_ms=clipped_start, end_ms=clipped_end))
        return result

    if window.kind == "weekly":
        if not window.days_of_week or not window.time_start or not window.time_end:
            return []
        start_minutes = parse_time_string_to_minutes(window.time_start)
        end_minutes = parse_time_string_to_minutes(window.time_end)
        day_cursor = start_of_day_ms(horizon.start_ms)
        while day_cursor < horizon.end_ms:
            dt = datetime.fromtimestamp(day_cursor / 1000)
            # Convert Python weekday (0=Mon) to JS getDay() convention (0=Sun)
            js_day = (dt.weekday() + 1) % 7
            if js_day in window.days_of_week:
                start = day_cursor + start_minutes * 60_000
                end = day_cursor + end_minutes * 60_000
                clipped_start = max(start, horizon.start_ms)
                clipped_end = min(end, horizon.end_ms)
                if clipped_start < clipped_end:
                    result.append(Interval(start_ms=clipped_start, end_ms=clipped_end))
            day_cursor += _MS_PER_DAY
        return result

    return []


def windows_to_interval_set(
    windows: list[TimeWindow] | None,
    horizon: Interval,
) -> IntervalSet:
    if not windows:
        return IntervalSet([horizon])
    intervals: list[Interval] = []
    for window in windows:
        intervals.extend(_window_to_interval_list(window, horizon))
    return IntervalSet(intervals)


def find_allowed_intervals(task: Task, horizon: Interval) -> IntervalSet:
    constraints = task.constraints

    allowed = windows_to_interval_set(
        constraints.allowed_windows if constraints else None,
        horizon,
    )

    if constraints and constraints.blackout_windows:
        blackout = windows_to_interval_set(constraints.blackout_windows, horizon)
        allowed = allowed.subtract(blackout)

    if constraints and constraints.earliest_start:
        earliest = parse_iso_to_ms(constraints.earliest_start)
        allowed = allowed.intersect(
            IntervalSet([Interval(start_ms=earliest, end_ms=horizon.end_ms)])
        )

    if constraints and constraints.latest_end:
        latest = parse_iso_to_ms(constraints.latest_end)
        allowed = allowed.intersect(
            IntervalSet([Interval(start_ms=horizon.start_ms, end_ms=latest)])
        )

    return allowed
