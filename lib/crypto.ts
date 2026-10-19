import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHex: string) {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

type SessionPayload = {
  sub: string;
  exp: number;
  /** Incremented whenever the owner replaces the password. */
  sv?: number;
};

export function signSession(sessionVersion = 0, ttlSeconds = 60 * 60 * 24 * 30) {
  const secret = process.env.JORNADA_SESSION_SECRET;
  if (!secret) throw new Error('JORNADA_SESSION_SECRET não configurado');
  const payload: SessionPayload = {
    sub: 'owner',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    sv: sessionVersion,
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySession(token?: string | null, expectedSessionVersion = 0) {
  if (!token) return false;
  const secret = process.env.JORNADA_SESSION_SECRET;
  if (!secret) return false;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return false;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    // Tokens emitted before session versioning are version zero. They remain
    // valid only until the first password replacement rotates the version.
    const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
    return payload.sub === 'owner' &&
      Number(payload.exp) > Math.floor(Date.now() / 1000) &&
      Number.isSafeInteger(sessionVersion) &&
      sessionVersion >= 0 &&
      sessionVersion === expectedSessionVersion;
  } catch {
    return false;
  }
}
