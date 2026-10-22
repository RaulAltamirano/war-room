/**
 * Discord HTTP interaction signature verification (Ed25519).
 * Uses Web Crypto so the same code runs in Node 22+ and Cloudflare Workers.
 */

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const n = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(n)) return null;
    out[i] = n;
  }
  return out;
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value));
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * @param {string|Uint8Array|ArrayBuffer} rawBody
 * @param {string} signatureHex X-Signature-Ed25519
 * @param {string} timestamp X-Signature-Timestamp
 * @param {string} publicKeyHex Application public key from the Developer Portal
 * @returns {Promise<boolean>}
 */
export async function verifyDiscordRequest(rawBody, signatureHex, timestamp, publicKeyHex) {
  try {
    const signature = hexToBytes(signatureHex);
    const keyBytes = hexToBytes(publicKeyHex);
    if (!signature || !keyBytes || !timestamp) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    return crypto.subtle.verify(
      'Ed25519',
      key,
      signature,
      concat(toBytes(timestamp), toBytes(rawBody)),
    );
  } catch {
    return false;
  }
}
