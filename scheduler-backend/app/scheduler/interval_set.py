from __future__ import annotations
from .intervals import Interval, assert_valid_interval, clone_interval


class IntervalSet:
    def __init__(self, intervals: list[Interval] | None = None) -> None:
        self._intervals = IntervalSet._normalize(intervals or [])

    @classmethod
    def empty(cls) -> IntervalSet:
        return cls([])

    @classmethod
    def from_list(cls, intervals: list[Interval]) -> IntervalSet:
        return cls(intervals)

    def to_list(self) -> list[Interval]:
        return [clone_interval(i) for i in self._intervals]

    def is_empty(self) -> bool:
        return len(self._intervals) == 0

    def size(self) -> int:
        return len(self._intervals)

    def total_duration_ms(self) -> int:
        return sum(i.end_ms - i.start_ms for i in self._intervals)

    def contains_point(self, ms: int) -> bool:
        left, right = 0, len(self._intervals) - 1
        while left <= right:
            mid = (left + right) >> 1
            interval = self._intervals[mid]
            if ms < interval.start_ms:
                right = mid - 1
            elif ms >= interval.end_ms:
                left = mid + 1
            else:
                return True
        return False

    def intersects_interval(self, other: Interval) -> bool:
        assert_valid_interval(other)
        for interval in self._intervals:
            start = max(interval.start_ms, other.start_ms)
            end = min(interval.end_ms, other.end_ms)
            if start < end:
                return True
            if interval.start_ms > other.end_ms:
                return False
        return False

    def union(self, other: IntervalSet) -> IntervalSet:
        return IntervalSet(self._intervals + other._intervals)

    def intersect(self, other: IntervalSet) -> IntervalSet:
        result: list[Interval] = []
        i, j = 0, 0
        while i < len(self._intervals) and j < len(other._intervals):
            a = self._intervals[i]
            b = other._intervals[j]
            start = max(a.start_ms, b.start_ms)
            end = min(a.end_ms, b.end_ms)
            if start < end:
                result.append(Interval(start_ms=start, end_ms=end))
            if a.end_ms < b.end_ms:
                i += 1
            else:
                j += 1
        return IntervalSet(result)

    def subtract(self, other: IntervalSet) -> IntervalSet:
        result: list[Interval] = []
        j = 0
        for a in self._intervals:
            current_start = a.start_ms
            while j < len(other._intervals) and other._intervals[j].end_ms <= a.start_ms:
                j += 1
            k = j
            while k < len(other._intervals) and other._intervals[k].start_ms < a.end_ms:
                b = other._intervals[k]
                if b.start_ms > current_start:
                    result.append(Interval(
                        start_ms=current_start,
                        end_ms=min(b.start_ms, a.end_ms),
                    ))
                current_start = max(current_start, b.end_ms)
                if current_start >= a.end_ms:
                    break
                k += 1
            if current_start < a.end_ms:
                result.append(Interval(start_ms=current_start, end_ms=a.end_ms))
        return IntervalSet(result)

    def complement(self, universe: Interval) -> IntervalSet:
        assert_valid_interval(universe)
        clipped = self.intersect(IntervalSet([universe]))
        result: list[Interval] = []
        prev = universe.start_ms
        for interval in clipped._intervals:
            if prev < interval.start_ms:
                result.append(Interval(start_ms=prev, end_ms=interval.start_ms))
            prev = max(prev, interval.end_ms)
        if prev < universe.end_ms:
            result.append(Interval(start_ms=prev, end_ms=universe.end_ms))
        return IntervalSet(result)

    @staticmethod
    def _normalize(intervals: list[Interval]) -> list[Interval]:
        if not intervals:
            return []
        for interval in intervals:
            assert_valid_interval(interval)
        sorted_intervals = sorted(
            [clone_interval(i) for i in intervals],
            key=lambda i: (i.start_ms, i.end_ms),
        )
        merged = [sorted_intervals[0]]
        for current in sorted_intervals[1:]:
            last = merged[-1]
            if current.start_ms <= last.end_ms:
                last.end_ms = max(last.end_ms, current.end_ms)
            else:
                merged.append(clone_interval(current))
        return merged
