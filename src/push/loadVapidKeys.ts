import { deserializeVapidKeys, fromBase64Url } from 'web-push-browser';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Load VAPID keys stored as either:
 * - web-push-browser PKCS8 private key, or
 * - legacy web-push raw 32-byte private key (current Cloudflare secret format).
 */
export async function loadVapidKeys(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const pubBytes = new Uint8Array(fromBase64Url(publicKey));
  const privBytes = new Uint8Array(fromBase64Url(privateKey));

  if (privBytes.length === 32 && pubBytes.length === 65) {
    const x = pubBytes.slice(1, 33);
    const y = pubBytes.slice(33, 65);
    const [privateKeyCrypto, publicKeyCrypto] = await Promise.all([
      crypto.subtle.importKey(
        'jwk',
        {
          kty: 'EC',
          crv: 'P-256',
          d: bytesToBase64Url(privBytes),
          x: bytesToBase64Url(x),
          y: bytesToBase64Url(y),
        },
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

  return deserializeVapidKeys({ publicKey, privateKey });
}
