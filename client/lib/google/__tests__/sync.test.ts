import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const insertMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../server', () => ({
  HttpError: class HttpError extends Error { constructor(public status: number, m: string) { super(m); } },
  googleStatus: (e: { code?: number }) => e?.code,
  getCalendar: async () => ({ events: { list: listMock, insert: insertMock, patch: patchMock, delete: vi.fn() } }),
}));

import { pullEvents, pushEvent } from '../sync';

interface Op { table: string; kind: string; payload?: unknown; filters: unknown[][] }

// Minimal chainable stand-in for the Supabase query builder that records what was called.
function fakeAdmin(opts: { masters?: { google_event_id: string }[]; eventRow?: Record<string, unknown> | null } = {}) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, kind: 'select', filters: [] };
    const chain: Record<string, unknown> = {};
    const result = () => {
      if (op.kind === 'select' && table === 'events' && op.filters.some(f => f[0] === 'not'))
        return { data: opts.masters ?? [], error: null };
      if (op.kind === 'select' && table === 'events') return { data: opts.eventRow ?? null, error: null };
      return { data: null, error: null };
    };
    for (const m of ['select', 'eq', 'not', 'in']) {
      chain[m] = (...a: unknown[]) => { if (m !== 'select') op.filters.push([m, ...a]); return chain; };
    }
    for (const m of ['upsert', 'update', 'delete']) {
      chain[m] = (payload?: unknown) => { op.kind = m; op.payload = payload; return chain; };
    }
    chain.maybeSingle = async () => { ops.push(op); return result(); };
    chain.then = (resolve: (v: unknown) => unknown) => { ops.push(op); return Promise.resolve(result()).then(resolve); };
    return chain;
  };
  return { admin: { from } as never, ops };
}

const conn = {
  user_id: 'u1', refresh_token_enc: 'x', calendar_id: 'primary', timezone: 'UTC', sync_token: null as string | null, last_synced_at: null,
};
const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  id, etag: `"${id}"`, summary: id, start: { dateTime: '2026-10-01T09:00:00Z' }, end: { dateTime: '2026-10-01T10:00:00Z' }, ...extra,
});

beforeEach(() => { listMock.mockReset(); insertMock.mockReset(); patchMock.mockReset(); });

describe('pullEvents', () => {
  it('imports across pages, dedupes, saves the sync token, and skips instances of locally-recurring masters', async () => {
    listMock
      .mockResolvedValueOnce({ data: { items: [ev('a'), ev('m_20261001', { recurringEventId: 'm' })], nextPageToken: 'p2' } })
      .mockResolvedValueOnce({ data: { items: [ev('a', { summary: 'a-v2' }), ev('b')], nextSyncToken: 'tok1' } });
    const { admin, ops } = fakeAdmin({ masters: [{ google_event_id: 'm' }] });

    const r = await pullEvents(admin, 'http://x', { ...conn });

    expect(r).toMatchObject({ imported: 2, deleted: 0, fullResync: true, truncated: false });
    const upsert = ops.find(o => o.kind === 'upsert')!;
    expect((upsert.payload as { google_event_id: string; title: string; user_id: string }[]).map(p => [p.google_event_id, p.title, p.user_id]))
      .toEqual([['a', 'a-v2', 'u1'], ['b', 'b', 'u1']]);
    const state = ops.find(o => o.table === 'google_connections')!;
    expect(state.payload).toMatchObject({ sync_token: 'tok1' });
    // first call is a bounded full import, not a token sync
    expect(listMock.mock.calls[0][0]).toMatchObject({ singleEvents: true });
    expect(listMock.mock.calls[0][0].timeMin).toBeTruthy();
    expect(listMock.mock.calls[0][0].syncToken).toBeUndefined();
  });

  it('uses the sync token incrementally and applies cancellations as deletes', async () => {
    listMock.mockResolvedValueOnce({ data: { items: [{ id: 'gone', status: 'cancelled' }, ev('c')], nextSyncToken: 'tok2' } });
    const { admin, ops } = fakeAdmin();
    const r = await pullEvents(admin, 'http://x', { ...conn, sync_token: 'tok1' });

    expect(r).toMatchObject({ imported: 1, deleted: 1, fullResync: false });
    expect(listMock.mock.calls[0][0]).toMatchObject({ syncToken: 'tok1' });
    expect(listMock.mock.calls[0][0].timeMin).toBeUndefined();
    const del = ops.find(o => o.kind === 'delete')!;
    expect(del.filters).toContainEqual(['in', 'google_event_id', ['gone']]);
    expect(del.filters).toContainEqual(['eq', 'user_id', 'u1']);
  });

  it('falls back to a full import when Google says the sync token expired (410)', async () => {
    listMock
      .mockRejectedValueOnce({ code: 410 })
      .mockResolvedValueOnce({ data: { items: [ev('d')], nextSyncToken: 'fresh' } });
    const { admin, ops } = fakeAdmin();
    const r = await pullEvents(admin, 'http://x', { ...conn, sync_token: 'stale' });

    expect(r.fullResync).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(ops.find(o => o.table === 'google_connections')!.payload).toMatchObject({ sync_token: 'fresh' });
  });

  it('does not advance the sync token when the listing was truncated', async () => {
    listMock.mockResolvedValue({ data: { items: [ev('x')], nextPageToken: 'more' } });
    const { admin, ops } = fakeAdmin();
    const r = await pullEvents(admin, 'http://x', { ...conn });
    expect(r.truncated).toBe(true);
    expect(ops.find(o => o.table === 'google_connections')!.payload).toMatchObject({ sync_token: null });
  });

  it('rethrows non-410 Google errors', async () => {
    listMock.mockRejectedValueOnce({ code: 500 });
    const { admin } = fakeAdmin();
    await expect(pullEvents(admin, 'http://x', { ...conn, sync_token: 't' })).rejects.toEqual({ code: 500 });
  });
});

describe('pushEvent', () => {
  const row = { id: 7, user_id: 'u1', title: 'Gym', date: '2026-10-01', start_time: '07:00', end_time: '08:00', description: '', source: 'local', recurrence: null, google_event_id: null };

  it('creates a Google event for an unlinked row and stores the link', async () => {
    insertMock.mockResolvedValueOnce({ data: { id: 'g9', etag: '"e"' } });
    const { admin, ops } = fakeAdmin({ eventRow: row });
    await expect(pushEvent(admin, 'http://x', { ...conn }, 7)).resolves.toEqual({ googleEventId: 'g9' });
    expect(insertMock.mock.calls[0][0].requestBody.start).toMatchObject({ dateTime: '2026-10-01T07:00:00', timeZone: 'UTC' });
    expect(ops.find(o => o.kind === 'update')!.payload).toEqual({ google_event_id: 'g9', google_etag: '"e"' });
  });

  it('patches a linked row, and recreates it if Google already deleted it', async () => {
    patchMock.mockRejectedValueOnce({ code: 404 });
    insertMock.mockResolvedValueOnce({ data: { id: 'g10', etag: '"n"' } });
    const { admin } = fakeAdmin({ eventRow: { ...row, google_event_id: 'old' } });
    await expect(pushEvent(admin, 'http://x', { ...conn }, 7)).resolves.toEqual({ googleEventId: 'g10' });
    expect(patchMock).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'old' }));
  });

  it('refuses events that are not the caller\'s', async () => {
    const { admin } = fakeAdmin({ eventRow: null });
    await expect(pushEvent(admin, 'http://x', { ...conn }, 7)).rejects.toMatchObject({ status: 404 });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
