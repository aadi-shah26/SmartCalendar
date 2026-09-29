import { NextRequest, NextResponse } from 'next/server';

const SCHEDULER_URL = process.env.SCHEDULER_URL ?? 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[schedule] sending to backend:', JSON.stringify(body).slice(0, 200));

    const backendRes = await fetch(`${SCHEDULER_URL}/schedule/cpsat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await backendRes.text();
    console.log('[schedule] backend status:', backendRes.status, 'body:', text.slice(0, 300));

    if (!backendRes.ok) {
      return NextResponse.json({ error: text }, { status: backendRes.status });
    }

    return NextResponse.json(JSON.parse(text), { status: 200 });
  } catch (err: any) {
    console.error('[schedule] error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
