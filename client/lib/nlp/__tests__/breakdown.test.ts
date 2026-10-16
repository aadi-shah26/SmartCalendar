import { describe, it, expect } from 'vitest';
import { buildBreakdownInstructions, fitToTotal, normalizeBreakdown, stepDeadlines } from '../breakdown';

describe('normalizeBreakdown', () => {
  it('cleans up titles and drops unusable or repeated steps', () => {
    const steps = normalizeBreakdown({ steps: [
      { title: '  Research   sources. ', minutes: 42 },
      { title: '', minutes: 30 },
      { title: 'Write draft', minutes: 0 },
      { title: 'research sources', minutes: 20 },
      { title: 'Write draft', minutes: 61 },
    ] }, null);
    expect(steps).toEqual([{ title: 'Research sources', minutes: 40 }, { title: 'Write draft', minutes: 60 }]);
  });
  it('needs at least two steps', () => {
    expect(() => normalizeBreakdown({ steps: [{ title: 'Do it', minutes: 60 }] }, null)).toThrow();
    expect(() => normalizeBreakdown({}, null)).toThrow();
    expect(() => normalizeBreakdown(null, null)).toThrow();
  });
  it('keeps at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Step ${i}`, minutes: 10 }));
    expect(normalizeBreakdown({ steps: many }, null)).toHaveLength(8);
  });
});

describe('fitToTotal', () => {
  it('scales minutes to the task estimate in 5-minute steps', () => {
    const out = fitToTotal([{ title: 'A', minutes: 30 }, { title: 'B', minutes: 60 }, { title: 'C', minutes: 30 }], 180);
    expect(out.map(s => s.minutes)).toEqual([45, 90, 45]);
  });
  it('puts the rounding difference on the longest step', () => {
    const out = fitToTotal([{ title: 'A', minutes: 1 }, { title: 'B', minutes: 1 }, { title: 'C', minutes: 1 }], 100);
    expect(out.reduce((n, s) => n + s.minutes, 0)).toBe(100);
    expect(out.every(s => s.minutes % 5 === 0)).toBe(true);
  });
});

describe('stepDeadlines', () => {
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const now = Date.parse(local(16, 12));
  it('spreads steps over the days before the deadline, at its time of day', () => {
    expect(stepDeadlines(now, local(20, 17), [60, 60, 120, 0])).toEqual([
      local(17, 17), local(18, 17), local(20, 17), local(20, 17),
    ]);
  });
  it('moves a due time that has already passed today to tomorrow, and keeps steps in order', () => {
    const evening = Date.parse(local(16, 18, 30));
    const out = stepDeadlines(evening, local(18, 9), [10, 10, 10]);
    expect(out).toEqual([local(17, 9), local(17, 9), local(18, 9)]);
  });
  it('never goes past the deadline', () => {
    const out = stepDeadlines(now, local(16, 15), [30, 30]);
    expect(out).toEqual([local(16, 15), local(16, 15)]);
  });
  it('leaves steps without a deadline when the task has none, and keeps a past one as is', () => {
    expect(stepDeadlines(now, null, [30, 30])).toEqual([null, null]);
    const past = local(10, 9);
    expect(stepDeadlines(now, past, [30, 30])).toEqual([past, past]);
  });
});

describe('instructions', () => {
  it('mentions the total when there is one', () => {
    expect(buildBreakdownInstructions({ title: 'Essay', description: '', durationMinutes: 180 })).toContain('about 180 minutes');
    expect(buildBreakdownInstructions({ title: 'Essay', description: '', durationMinutes: null })).toContain('Estimate realistic');
  });
});
