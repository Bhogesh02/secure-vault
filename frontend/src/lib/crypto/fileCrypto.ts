const ENVELOPE_VERSION = "VaultSphereEncryptedFile:v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type EncryptedEnvelope = {
  version: typeof ENVELOPE_VERSION;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  originalType: string;
  ciphertext: string;
};

const KEY_ITERATIONS = 250_000;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveFileKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(file: File, passphrase: string) {
  if (passphrase.length < 8) {
    throw new Error("Encryption key must be at least 8 characters.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveFileKey(passphrase, salt, KEY_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, await file.arrayBuffer());

  const envelope: EncryptedEnvelope = {
    version: ENVELOPE_VERSION,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: KEY_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    originalType: file.type || "application/octet-stream",
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };

  return new File([JSON.stringify(envelope)], file.name, { type: "application/octet-stream" });
}

export async function decryptFilePayload(payload: Blob, passphrase: string) {
  if (passphrase.length < 8) {
    throw new Error("Encryption key must be at least 8 characters.");
  }

  const envelope = JSON.parse(decoder.decode(await payload.arrayBuffer())) as EncryptedEnvelope;
  if (envelope.version !== ENVELOPE_VERSION || envelope.algorithm !== "AES-GCM") {
    throw new Error("This file is not a VaultSphere encrypted file.");
  }

  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveFileKey(passphrase, salt, envelope.iterations);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));

  return new Blob([plainBuffer], { type: envelope.originalType });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
