import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/google/crypto';
import { errorResponse, getAdminClient, getConnection, getSiteUrl, newOAuthClient, requireUser } from '@/lib/google/server';

// Removes the connection. Events already in the app stay, but are unlinked from Google so
// later edits don't try to sync.
export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const userId = await requireUser(req, admin);
    const conn = await getConnection(admin, userId);
    if (conn) {
      try {
        await newOAuthClient(getSiteUrl(req)).revokeToken(decryptToken(conn.refresh_token_enc));
      } catch (err) {
        console.warn('[google] token revoke failed (continuing)', err); // already revoked/expired
      }
      const { error } = await admin.from('google_connections').delete().eq('user_id', userId);
      if (error) throw new Error(error.message);
      await admin.from('events').update({ google_event_id: null, google_etag: null }).eq('user_id', userId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
