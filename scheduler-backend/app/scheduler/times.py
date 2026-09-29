from datetime import datetime


def parse_iso_to_ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).timestamp() * 1000)


def parse_time_string_to_minutes(time: str) -> int:
    h, m = map(int, time.split(":"))
    return h * 60 + m


def start_of_day_ms(ms: int) -> int:
    dt = datetime.fromtimestamp(ms / 1000)
    day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(day_start.timestamp() * 1000)
