import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, HttpError, requireUser } from '@/lib/google/server';
import { buildInstructions, normalizeParse, RESPONSE_SCHEMA, type ParseContext } from '@/lib/nlp/parse';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

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

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const res = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildInstructions(ctx) }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
    });

    if (res.status === 429) throw new HttpError(429, 'Gemini free-tier limit reached — wait a minute and try again.');
    if (res.status === 400 || res.status === 403) {
      const detail = await res.json().catch(() => null);
      console.error('[parse] Gemini rejected the request:', detail?.error?.message ?? res.status);
      throw new HttpError(502, 'Gemini rejected the request — check that GEMINI_API_KEY is valid.');
    }
    if (!res.ok) throw new HttpError(502, `Gemini is unavailable right now (${res.status}). Try again shortly.`);

    const data = await res.json();
    const reply: string | undefined = data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text;
    if (!reply) throw new HttpError(422, "Couldn't understand that — try rephrasing it.");

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
