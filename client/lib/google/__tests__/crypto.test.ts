import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'crypto';
import { decryptToken, encryptToken, newNonce, signState, verifyState } from '../crypto';

beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('token encryption', () => {
  it('round-trips and is non-deterministic', () => {
    const a = encryptToken('1//refresh-token');
    const b = encryptToken('1//refresh-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(decryptToken(a)).toBe('1//refresh-token');
  });
  it('rejects tampered ciphertext', () => {
    const enc = encryptToken('secret');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered!!').toString('base64url');
    expect(() => decryptToken(parts.join('.'))).toThrow();
  });
  it('rejects a wrong-length key', () => {
    const prev = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = prev;
  });
});

describe('oauth state', () => {
  const payload = () => ({ uid: 'user-1', nonce: newNonce(), tz: 'UTC', exp: Date.now() + 60_000 });
  it('verifies a signed state', () => {
    const p = payload();
    expect(verifyState(signState(p))).toEqual(p);
  });
  it('rejects tampered, expired and malformed state', () => {
    const good = signState(payload());
    const [body, sig] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload(), uid: 'attacker' })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${body}.AAAA`)).toBeNull();
    expect(verifyState(signState({ ...payload(), exp: Date.now() - 1 }))).toBeNull();
    expect(verifyState('garbage')).toBeNull();
  });
});
