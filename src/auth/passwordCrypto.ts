import crypto from 'crypto';

/** Stored as sha256$<saltHex>$<digestHex>. Salt is random, not the public StaffKey. */
export function hashPassword(password: string, salt?: string): string {
  const useSalt = salt && salt.trim() ? salt.trim() : crypto.randomBytes(16).toString('hex');
  const digest = crypto.createHash('sha256').update(`${password}:${useSalt}`, 'utf8').digest('hex');
  return `sha256$${useSalt}$${digest}`;
}

export function legacyStaffKeyHash(password: string, staffKey: string): string {
  return crypto.createHash('sha256').update(`${password}:${staffKey}`, 'utf8').digest('hex');
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Accepts the salted hash, the old StaffKey SHA-256, or a one-time plaintext value.
 * `upgraded` is set when the stored value should be replaced.
 */
export function verifyPassword(
  password: string,
  stored: string,
  staffKey: string
): { ok: boolean; upgraded?: string } {
  const saved = String(stored || '').trim();
  const input = String(password || '');
  if (!saved || !input) return { ok: false };

  if (saved.startsWith('sha256$')) {
    const parts = saved.split('$');
    if (parts.length !== 3 || !parts[1] || !parts[2]) return { ok: false };
    return { ok: hashesMatch(hashPassword(input, parts[1]), saved) };
  }

  if (/^[0-9a-f]{64}$/i.test(saved)) {
    const legacy = legacyStaffKeyHash(input, staffKey);
    if (hashesMatch(legacy, saved)) {
      return { ok: true, upgraded: hashPassword(input) };
    }
    return { ok: false };
  }

  const savedBuf = Buffer.from(saved);
  const inputBuf = Buffer.from(input);
  const plaintextMatch = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);
  if (plaintextMatch) {
    return { ok: true, upgraded: hashPassword(input) };
  }
  return { ok: false };
}
