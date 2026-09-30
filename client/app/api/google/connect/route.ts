import { NextRequest, NextResponse } from 'next/server';
import { newNonce, signState } from '@/lib/google/crypto';
import { isValidTimeZone } from '@/lib/google/mapping';
import {
  errorResponse,
  getAdminClient,
  getSiteUrl,
  GOOGLE_SCOPE,
  newOAuthClient,
  requireUser,
} from '@/lib/google/server';

// Starts the Google consent flow for the signed-in user. Returns the URL for the browser to
// visit. The signed `state` carries the user id (so the callback knows who is connecting), and
// the same nonce goes into an httpOnly cookie so the callback can only be completed by the
// browser that started it.
export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    const userId = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const tz = isValidTimeZone(body?.timezone) ? body.timezone : 'UTC';

    const siteUrl = getSiteUrl(req);
    const nonce = newNonce();
    const state = signState({ uid: userId, nonce, tz, exp: Date.now() + 10 * 60 * 1000 });

    const url = newOAuthClient(siteUrl).generateAuthUrl({
      access_type: 'offline',  // ask for a refresh token
      prompt: 'consent',       // force one even if the user has connected before
      scope: [GOOGLE_SCOPE],
      include_granted_scopes: true,
      state,
    });

    const res = NextResponse.json({ url });
    res.cookies.set('gcal_oauth_nonce', nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: siteUrl.startsWith('https://'),
      path: '/api/auth',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    const { status, body } = errorResponse(err);
    return NextResponse.json(body, { status });
  }
}
