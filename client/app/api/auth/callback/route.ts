import { NextRequest, NextResponse } from 'next/server';
import { encryptToken, verifyState } from '@/lib/google/crypto';
import { getAdminClient, getConnection, getSiteUrl, GOOGLE_SCOPE, newOAuthClient } from '@/lib/google/server';
import { pullEvents } from '@/lib/google/sync';

// Google redirects here after consent. Register `<site>/api/auth/callback` as an authorised
// redirect URI in Google Cloud (once for localhost, once for each hosted domain).
export async function GET(req: NextRequest) {
  const siteUrl = getSiteUrl(req);
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/calendar?google=${result}`, siteUrl));
    res.cookies.delete({ name: 'gcal_oauth_nonce', path: '/api/auth' });
    return res;
  };

  const { searchParams } = new URL(req.url);
  if (searchParams.get('error')) return back('denied');

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const payload = state ? verifyState(state) : null;
  const cookieNonce = req.cookies.get('gcal_oauth_nonce')?.value;
  if (!code || !payload || !cookieNonce || cookieNonce !== payload.nonce) return back('invalid');

  try {
    const { tokens } = await newOAuthClient(siteUrl).getToken(code);
    if (!tokens.scope?.split(' ').includes(GOOGLE_SCOPE)) return back('denied'); // calendar box unticked
    if (!tokens.refresh_token) return back('no_refresh_token');

    const admin = getAdminClient();
    const { error } = await admin.from('google_connections').upsert({
      user_id: payload.uid,
      refresh_token_enc: encryptToken(tokens.refresh_token),
      timezone: payload.tz,
      calendar_id: 'primary',
      sync_token: null, // a fresh connection always starts with a full import
      last_synced_at: null,
    });
    if (error) throw new Error(error.message);

    const conn = await getConnection(admin, payload.uid);
    if (conn) {
      try {
        await pullEvents(admin, siteUrl, conn);
      } catch (err) {
        // Connected, but the first import failed: the user can retry with "Sync".
        console.error('[google] initial import failed', err);
        return back('connected_sync_failed');
      }
    }
    return back('connected');
  } catch (err) {
    console.error('[google] OAuth callback failed', err);
    return back('error');
  }
}
