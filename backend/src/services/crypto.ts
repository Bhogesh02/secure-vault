const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const PBKDF2_ITERATIONS = 100_000;
const HASH_LENGTH = 32;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(encoder.encode(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations
    },
    key,
    HASH_LENGTH * 8
  );
  return new Uint8Array(bits);
}

export async function hashSecret(value: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(value, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifySecret(value: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterations, saltB64, hashB64] = storedHash.split("$");
  if (algorithm !== "pbkdf2" || !iterations || !saltB64 || !hashB64) {
    return false;
  }

  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const iterationCount = Number(iterations);
  if (!Number.isInteger(iterationCount) || iterationCount < 1 || iterationCount > PBKDF2_ITERATIONS) {
    return false;
  }

  const derived = await deriveBits(value, salt, iterationCount);

  return timingSafeEqual(derived, expected);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64(new Uint8Array(digest));
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateTokenId(bytes = 32): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function bytesToText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

// Simple Base32 Encoding for Authenticator Apps
export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function fromBase32(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    const charValue = BASE32_ALPHABET.indexOf(clean[i]);
    if (charValue === -1) continue;
    value = (value << 5) | charValue;
    bits += 5;
    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return bytes;
}

export function generateTotpSecret(): string {
  return toBase32(crypto.getRandomValues(new Uint8Array(20)));
}

export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const cleanCode = code.replace(/\s/g, "");
  if (cleanCode.length !== 6) return false;
  
  // Check current, previous, and next windows (30s each) to account for clock skew
  const time = BigInt(Math.floor(Date.now() / 30000));
  for (let i = -1n; i <= 1n; i = i + 1n) {
    const generated = await generateTotpCode(secret, time + i);
    if (generated === cleanCode) {
      return true;
    }
  }
  return false;
}

async function generateTotpCode(secret: string, time: bigint): Promise<string> {
  const key = fromBase32(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const msg = new Uint8Array(8);
  let t = time;
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(t & 0xffn);
    t >>= 8n;
  }

  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msg);
  const hmac = new Uint8Array(sig);
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}


