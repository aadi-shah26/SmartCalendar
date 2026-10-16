// Asking Gemini for structured JSON, shared by the API routes (server only). Requests race a
// backup model when slow, and failures become friendly HttpErrors.
import { HttpError } from '@/lib/google/server';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const BACKUP_MODEL = 'gemini-flash-lite-latest';
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
        console.warn(`[gemini] ${models[i]} failed (${result.status})${result.message ? `: ${result.message}` : ''}`);
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
      console.error('[gemini] Gemini rejected the request:', failure.message ?? failure.status);
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

/** The models to try: GEMINI_MODEL (or the default), then the backup. */
export function geminiModels(): string[] {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return primary === BACKUP_MODEL ? [primary] : [primary, BACKUP_MODEL];
}

/**
 * Sends `instructions` and the user's `text`, asking for JSON matching `schema`, and returns the
 * parsed reply. Throws HttpError for a missing key, Gemini failures, or a reply that isn't JSON.
 */
export async function askGeminiJson(instructions: string, text: string, schema: object, temperature = 0): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'Natural-language input is not set up: add GEMINI_API_KEY to .env.local and restart the server.');
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
  });
  const reply = await askWithBackup(geminiModels(), key, payload);
  try {
    return JSON.parse(reply);
  } catch {
    throw new HttpError(422, "Couldn't understand that — try rephrasing it.");
  }
}
