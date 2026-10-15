import { describe, it, expect } from 'vitest';
import { describeAtRisk, describeChanges } from '../replanMessages';

const at = (day: number, h: number) => new Date(2026, 9, day, h).getTime();
const iv = (day: number, h: number, min = 60) => ({ startMs: at(day, h), endMs: at(day, h) + min * 60_000 });
const title = (id: string) => ({ a: 'Essay', b: 'Slides' } as Record<string, string>)[id] ?? 'A task';

describe('describeChanges', () => {
  it('describes each kind of change in plain words', () => {
    const text = describeChanges([
      { taskId: 'a', kind: 'added', from: null, to: iv(6, 9, 90) },
      { taskId: 'b', kind: 'moved', from: iv(6, 9), to: iv(7, 10), displacedBy: 'a' },
      { taskId: 'a', kind: 'shortened', from: iv(8, 9), to: iv(8, 9, 30) },
      { taskId: 'b', kind: 'removed', from: iv(9, 9), to: null },
    ], [], title);
    expect(text).toMatch(/^Planned 1h 30m of "Essay" for .+\. Moved "Slides" from .+ to .+ to make room for "Essay"\. Shortened "Essay" on .+ to 30m\. Removed the "Slides" session on .+; it's no longer needed\.$/);
  });

  it('leaves removals of at-risk work to the at-risk notice', () => {
    expect(describeChanges([{ taskId: 'a', kind: 'removed', from: iv(6, 9), to: null }],
      [{ taskId: 'a', minutes: 60, reason: 'x' }], title)).toBe('');
  });

  it('summarises long lists', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ taskId: 'a', kind: 'added' as const, from: null, to: iv(6, 9 + i) }));
    expect(describeChanges(many, [], title)).toMatch(/And 2 more changes\.$/);
  });
});

describe('describeAtRisk', () => {
  it('says how much is short and why', () => {
    expect(describeAtRisk({ taskId: 'a', minutes: 90, reason: 'Not enough free time before its deadline.' }, title))
      .toBe('"Essay" has 1h 30m of work with no time left for it. Not enough free time before its deadline.');
  });
});
