/**
 * Discord HTTP interaction signature verification (Ed25519).
 * Uses tweetnacl — the same approach as Discord's docs / discord-interactions.
 */
import nacl from 'tweetnacl';

function hexToBytes(hex) {
  const clean = String(hex || '').trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value));
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
    const key = hexToBytes(publicKeyHex);
    if (!signature || !key || signature.length !== 64 || key.length !== 32 || !timestamp) {
      return false;
    }
    const message = toBytes(String(timestamp) + (typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(toBytes(rawBody))));
    return nacl.sign.detached.verify(message, signature, key);
  } catch {
    return false;
  }
}
