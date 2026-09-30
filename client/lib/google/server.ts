import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { google, type calendar_v3 } from 'googleapis';
import type { NextRequest } from 'next/server';
import { decryptToken } from './crypto';

// Server-only. Never import this from a client component: it reads the service-role key.

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Base URL of this deployment. Same rule as the browser side so redirect URIs always match. */
export function getSiteUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
}

export function getRedirectUri(siteUrl: string): string {
  return `${siteUrl}/api/auth/callback`;
}

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Identify the caller from `Authorization: Bearer <supabase access token>`. */
export async function requireUser(req: NextRequest, admin: SupabaseClient): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Not signed in.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Not signed in.');
  return data.user.id;
}

export function newOAuthClient(siteUrl: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.');
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(siteUrl));
}

export interface GoogleConnection {
  user_id: string;
  refresh_token_enc: string;
  calendar_id: string;
  timezone: string;
  sync_token: string | null;
  last_synced_at: string | null;
}

export async function getConnection(admin: SupabaseClient, userId: string): Promise<GoogleConnection | null> {
  const { data, error } = await admin.from('google_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Failed to load Google connection: ${error.message}`);
  return data as GoogleConnection | null;
}

export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } };
  return e?.response?.data?.error === 'invalid_grant' || /invalid_grant/.test(e?.message ?? '');
}

export function googleStatus(err: unknown): number | undefined {
  const e = err as { code?: number | string; response?: { status?: number } };
  const code = typeof e?.code === 'number' ? e.code : Number(e?.code);
  return e?.response?.status ?? (Number.isFinite(code) ? code : undefined);
}

/**
 * Calendar client authorised as the user. The access token is refreshed automatically from the
 * stored refresh token. If Google says the grant is gone (user revoked access, or the 7-day
 * Testing-mode expiry), the dead connection is removed and the caller gets a 409.
 */
export async function getCalendar(
  admin: SupabaseClient,
  siteUrl: string,
  conn: GoogleConnection
): Promise<calendar_v3.Calendar> {
  const auth = newOAuthClient(siteUrl);
  auth.setCredentials({ refresh_token: decryptToken(conn.refresh_token_enc) });
  try {
    await auth.getAccessToken();
  } catch (err) {
    if (isInvalidGrant(err)) {
      await admin.from('google_connections').delete().eq('user_id', conn.user_id);
      throw new HttpError(409, 'Google access expired or was revoked. Please reconnect.');
    }
    throw err;
  }
  return google.calendar({ version: 'v3', auth });
}

export function errorResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
  console.error('[google]', err);
  return { status: 500, body: { error: 'Something went wrong talking to Google Calendar.' } };
}
