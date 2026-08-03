import { deserializeVapidKeys, fromBase64Url } from 'web-push-browser';

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derTag(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(content.length), content);
}

function derInteger(value: number): Uint8Array {
  return derTag(0x02, new Uint8Array([value]));
}

function derOctetString(bytes: Uint8Array): Uint8Array {
  return derTag(0x04, bytes);
}

function derSequence(parts: Uint8Array[]): Uint8Array {
  return derTag(0x30, concatBytes(...parts));
}

function derBitString(bytes: Uint8Array): Uint8Array {
  return derTag(0x03, concatBytes(new Uint8Array([0x00]), bytes));
}

function derContextSpecific(tag: number, content: Uint8Array): Uint8Array {
  return derTag(0xa0 | tag, content);
}

function rawWebPushPrivateKeyToPkcs8(privateKey: Uint8Array, publicKey: Uint8Array): ArrayBuffer {
  const oidEc = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const oidCurve = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const algorithmIdentifier = derSequence([oidEc, oidCurve]);

  const ecPrivateKey = derSequence([
    derInteger(1),
    derOctetString(privateKey),
    derContextSpecific(1, derBitString(publicKey)),
  ]);

  const pkcs8 = derSequence([
    derInteger(0),
    algorithmIdentifier,
    derOctetString(ecPrivateKey),
  ]);

  return pkcs8.buffer;
}

async function importLegacyWebPushKeys(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const pubBytes = new Uint8Array(fromBase64Url(publicKey));
  const privBytes = new Uint8Array(fromBase64Url(privateKey));

  if (privBytes.length !== 32 || pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Unsupported legacy VAPID key shape');
  }

  const pkcs8 = rawWebPushPrivateKeyToPkcs8(privBytes, pubBytes);
  const [privateKeyCrypto, publicKeyCrypto] = await Promise.all([
    crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    ),
    crypto.subtle.importKey(
      'raw',
      pubBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    ),
  ]);

  return { privateKey: privateKeyCrypto, publicKey: publicKeyCrypto };
}

/**
 * Load VAPID keys stored as either:
 * - web-push-browser PKCS8 private key, or
 * - legacy web-push raw 32-byte private key (current Cloudflare secret format).
 */
export async function loadVapidKeys(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const privBytes = new Uint8Array(fromBase64Url(privateKey));
  if (privBytes.length === 32) {
    return importLegacyWebPushKeys(publicKey, privateKey);
  }
  return deserializeVapidKeys({ publicKey, privateKey });
}
