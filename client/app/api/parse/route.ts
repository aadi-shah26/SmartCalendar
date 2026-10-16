import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, HttpError, requireUser } from '@/lib/google/server';
import { askGeminiJson } from '@/lib/nlp/gemini';
import { buildInstructions, normalizeParse, RESPONSE_SCHEMA, type ParseContext } from '@/lib/nlp/parse';

// { text, now: "YYYY-MM-DDTHH:MM", weekday, timezone } -> { item: ParsedEvent | ParsedTask }
export async function POST(req: NextRequest) {
  try {
    await requireUser(req, getAdminClient());

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) throw new HttpError(400, 'Type something to add.');
    if (text.length > 500) throw new HttpError(400, 'That is too long — keep it to one line.');
    const ctx: ParseContext = {
      now: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now) ? body.now : new Date().toISOString().slice(0, 16),
      weekday: typeof body.weekday === 'string' ? body.weekday.slice(0, 12) : '',
      timezone: typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : 'UTC',
    };

    const raw = await askGeminiJson(buildInstructions(ctx), text, RESPONSE_SCHEMA);
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
