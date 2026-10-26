// PIN-derived encryption (D2). PBKDF2-SHA256 -> AES-GCM-256.
// Only the salt and a verifier ciphertext are stored unencrypted.

const enc = new TextEncoder();
const dec = new TextDecoder();

export type KeyPair = { key: CryptoKey; salt: string; iterations: number; verifier: string };

const ITERATIONS = 250_000;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const VERIFIER_PLAINTEXT = "tinkeredu-pin-check-v1";

// Create a fresh key set for a new PIN.
export async function createPinKeys(pin: string): Promise<KeyPair> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt, ITERATIONS);
  const verifier = await encryptJson(key, VERIFIER_PLAINTEXT);
  return { key, salt: b64(salt), iterations: ITERATIONS, verifier };
}

// Unlock with PIN against stored salt+verifier. Returns the key or null.
export async function unlock(
  pin: string,
  saltB64: string,
  iterations: number,
  verifier: string,
): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(pin, unb64(saltB64), iterations);
    const plain = await decryptJson<string>(key, verifier);
    return plain === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(JSON.stringify(value)),
  );
  // pack iv + ciphertext
  const packed = new Uint8Array(12 + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), 12);
  return b64(packed);
}

export async function decryptJson<T>(key: CryptoKey, packedB64: string): Promise<T> {
  const packed = unb64(packedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(dec.decode(pt)) as T;
}
