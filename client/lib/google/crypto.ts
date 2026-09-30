import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Server-only helpers: encrypt refresh tokens at rest and sign the OAuth `state` value.

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing GOOGLE_TOKEN_ENCRYPTION_KEY (base64-encoded 32 bytes).');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

// Separate sub-key for signing so the same secret is never used for two purposes directly.
function getStateKey(): Buffer {
  return createHmac('sha256', getKey()).update('oauth-state').digest();
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

export function decryptToken(enc: string): string {
  const [version, iv, tag, ct] = enc.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognized token format.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export interface OAuthStatePayload {
  uid: string;   // Supabase user id that started the connect flow
  nonce: string; // also stored in an httpOnly cookie to bind the flow to this browser
  tz: string;    // the user's IANA timezone
  exp: number;   // epoch ms
}

export function signState(payload: OAuthStatePayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', getStateKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', getStateKey()).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (typeof payload.uid !== 'string' || typeof payload.nonce !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return b64url(randomBytes(16));
}
