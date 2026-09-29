from dataclasses import dataclass


@dataclass
class Interval:
    start_ms: int
    end_ms: int


def assert_valid_interval(interval: Interval) -> None:
    if not isinstance(interval.start_ms, (int, float)) or not isinstance(interval.end_ms, (int, float)):
        raise ValueError("Interval start_ms and end_ms must be finite numbers.")
    if interval.start_ms >= interval.end_ms:
        raise ValueError(
            f"Invalid interval: start_ms ({interval.start_ms}) must be less than end_ms ({interval.end_ms})."
        )


def clone_interval(interval: Interval) -> Interval:
    return Interval(start_ms=interval.start_ms, end_ms=interval.end_ms)
