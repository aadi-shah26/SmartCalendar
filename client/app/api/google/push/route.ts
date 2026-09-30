import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getAdminClient, getConnection, getSiteUrl, HttpError, requireUser } from '@/lib/google/server';
import { deleteGoogleEvent, pushEvent } from '@/lib/google/sync';

// { action: 'upsert', eventId }          create/update the Google copy of a local event
// { action: 'delete', googleEventId }    remove the Google copy of a deleted local event
export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const userId = await requireUser(req, admin);
    const conn = await getConnection(admin, userId);
    if (!conn) return NextResponse.json({ skipped: true }); // not connected: nothing to do

    const body = await req.json().catch(() => ({}));
    const siteUrl = getSiteUrl(req);
    if (body.action === 'upsert' && (typeof body.eventId === 'string' || typeof body.eventId === 'number')) {
      return NextResponse.json(await pushEvent(admin, siteUrl, conn, body.eventId));
    }
    if (body.action === 'delete' && typeof body.googleEventId === 'string') {
      await deleteGoogleEvent(admin, siteUrl, conn, body.googleEventId);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, 'Invalid request.');
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
