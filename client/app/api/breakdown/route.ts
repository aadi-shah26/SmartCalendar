import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, HttpError, requireUser } from '@/lib/google/server';
import { askGeminiJson } from '@/lib/nlp/gemini';
import { BREAKDOWN_SCHEMA, breakdownPrompt, buildBreakdownInstructions, normalizeBreakdown, type BreakdownRequest } from '@/lib/nlp/breakdown';

// { title, description?, durationMinutes? } -> { steps: [{ title, minutes }] }
export async function POST(req: NextRequest) {
  try {
    await requireUser(req, getAdminClient());

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw new HttpError(400, 'The task needs a title first.');
    const request: BreakdownRequest = {
      title: title.slice(0, 200),
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '',
      durationMinutes: Number.isFinite(body.durationMinutes) && body.durationMinutes > 0 ? Math.min(Math.round(body.durationMinutes), 24 * 60 * 7) : null,
    };

    // A little variety, so asking again can suggest a different split.
    const raw = await askGeminiJson(buildBreakdownInstructions(request), breakdownPrompt(request), BREAKDOWN_SCHEMA, 0.4);
    try {
      return NextResponse.json({ steps: normalizeBreakdown(raw, request.durationMinutes) });
    } catch (err) {
      throw new HttpError(422, err instanceof Error ? `${err.message} Try again, or add some details to the task.` : "Couldn't split that up.");
    }
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[breakdown]', err);
    return NextResponse.json({ error: 'Something went wrong splitting that up.' }, { status: 500 });
  }
}
