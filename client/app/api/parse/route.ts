import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, HttpError, requireUser } from '@/lib/google/server';
import { buildInstructions, normalizeParse, RESPONSE_SCHEMA, type ParseContext } from '@/lib/nlp/parse';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const BACKUP_MODEL = 'gemini-flash-lite-latest';
// Gemini's free tier usually answers in ~1s but now and then sits on a request for 20s+.
// Rather than wait, a request that hasn't answered by HEDGE_MS gets a backup request racing it.
const HEDGE_MS = 2_000;
const TOTAL_MS = 15_000;

type Attempt = { ok: true; reply: string } | { ok: false; status: number; message?: string };

async function ask(model: string, key: string, payload: string, signal: AbortSignal): Promise<Attempt> {
  try {
    const res = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: payload,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, message: data?.error?.message };
    const reply: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
    return reply ? { ok: true, reply } : { ok: false, status: 422 };
  } catch {
    return { ok: false, status: 504 }; // aborted or network error
  }
}

/**
 * Tries each model in turn, starting the next one when the previous fails or HEDGE_MS passes,
 * and returns the first answer. A bad key (400/403) stops immediately: another model won't help.
 */
function askWithBackup(models: string[], key: string, payload: string): Promise<string> {
  const controllers = models.map(() => new AbortController());
  const deadline = setTimeout(() => controllers.forEach(c => c.abort()), TOTAL_MS);

  return new Promise<string>((resolve, reject) => {
    let started = 0;
    let finished = 0;
    let settled = false;
    let lastFailure: Attempt & { ok: false } = { ok: false, status: 504 };
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(hedgeTimer);
      controllers.forEach(c => c.abort());
      fn();
    };

    const startNext = () => {
      if (settled || started >= models.length) return;
      const i = started++;
      clearTimeout(hedgeTimer);
      if (started < models.length) hedgeTimer = setTimeout(startNext, HEDGE_MS);
      ask(models[i], key, payload, controllers[i].signal).then(result => {
        finished++;
        if (result.ok) return done(() => resolve(result.reply));
        if (result.status === 400 || result.status === 403) return done(() => reject(geminiError(result, models[i])));
        if (result.status !== 504 || lastFailure.status === 504) lastFailure = result;
        console.warn(`[parse] ${models[i]} failed (${result.status})${result.message ? `: ${result.message}` : ''}`);
        if (started < models.length) startNext();
        else if (finished === started) done(() => reject(geminiError(lastFailure, models[i])));
      });
    };

    startNext();
  });
}

function geminiError(failure: { status: number; message?: string }, model: string): HttpError {
  switch (failure.status) {
    case 400:
    case 403:
      console.error('[parse] Gemini rejected the request:', failure.message ?? failure.status);
      return new HttpError(502, 'Gemini rejected the request — check that GEMINI_API_KEY is valid.');
    case 404:
      return new HttpError(502, `Gemini model "${model}" is not available — set GEMINI_MODEL in .env.local to a current model.`);
    case 429:
      return new HttpError(429, 'Gemini free-tier limit reached — wait a minute and try again.');
    case 422:
      return new HttpError(422, "Couldn't understand that — try rephrasing it.");
    case 504:
      return new HttpError(504, 'Gemini took too long to answer — try again.');
    default:
      return new HttpError(502, `Gemini is unavailable right now (${failure.status}). Try again shortly.`);
  }
}

// { text, now: "YYYY-MM-DDTHH:MM", weekday, timezone } -> { item: ParsedEvent | ParsedTask }
export async function POST(req: NextRequest) {
  try {
    await requireUser(req, getAdminClient());

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new HttpError(503, 'Natural-language input is not set up: add GEMINI_API_KEY to .env.local and restart the server.');

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Type something to add.');
    if (text.length > 500) throw new HttpError(400, 'That is too long — keep it to one line.');
    const ctx: ParseContext = {
      now: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now) ? body.now : new Date().toISOString().slice(0, 16),
      weekday: typeof body.weekday === 'string' ? body.weekday.slice(0, 12) : '',
      timezone: typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : 'UTC',
    };

    const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const models = primary === BACKUP_MODEL ? [primary] : [primary, BACKUP_MODEL];
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: buildInstructions(ctx) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    });

    const reply = await askWithBackup(models, key, payload);

    let raw: unknown;
    try {
      raw = JSON.parse(reply);
    } catch {
      throw new HttpError(422, "Couldn't understand that — try rephrasing it.");
    }
    try {
      return NextResponse.json({ item: normalizeParse(raw, ctx) });
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? `${err.message} Try rephrasing it.` : "Couldn't understand that.");
    }
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[parse]', err);
    return NextResponse.json({ error: 'Something went wrong reading that.' }, { status: 500 });
  }
}
