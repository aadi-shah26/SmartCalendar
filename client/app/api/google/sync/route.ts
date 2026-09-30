import { NextRequest, NextResponse } from 'next/server';
import { isValidTimeZone } from '@/lib/google/mapping';
import { errorResponse, getAdminClient, getConnection, getSiteUrl, requireUser } from '@/lib/google/server';
import { pullEvents } from '@/lib/google/sync';

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const userId = await requireUser(req, admin);
    const conn = await getConnection(admin, userId);
    if (!conn) return NextResponse.json({ error: 'Google Calendar is not connected.' }, { status: 404 });

    // Keep the stored timezone current (e.g. the user travelled or changed devices).
    const body = await req.json().catch(() => ({}));
    if (isValidTimeZone(body?.timezone) && body.timezone !== conn.timezone) {
      await admin.from('google_connections').update({ timezone: body.timezone }).eq('user_id', userId);
      conn.timezone = body.timezone;
    }

    const result = await pullEvents(admin, getSiteUrl(req), conn);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
