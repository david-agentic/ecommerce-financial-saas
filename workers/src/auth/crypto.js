/**
 * Web Crypto API Security Utilities for Cloudflare Workers.
 * Handles PBKDF2 password hashing, salt generation, constant-time verification, and SHA-256 token hashing.
 */

export async function hashPassword(password, saltHex = null) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 10000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashHex = bytesToHex(new Uint8Array(derivedKey));
  const saltOut = bytesToHex(salt);
  return `${saltOut}:${hashHex}`;
}

export async function verifyPassword(password, storedCombinedHash) {
  if (!storedCombinedHash || !storedCombinedHash.includes(':')) return false;
  const [saltHex, expectedHashHex] = storedCombinedHash.split(':');
  const computedCombined = await hashPassword(password, saltHex);
  const [, computedHashHex] = computedCombined.split(':');

  return safeCompare(expectedHashHex, computedHashHex);
}

export function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

export async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
