const encoder = new TextEncoder();

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    } as Pbkdf2Params,
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(file: Blob | File, password: string): Promise<{ blob: Blob; salt: string; iv: string }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const arrayBuffer = await file.arrayBuffer();
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );

  const saltB64 = btoa(String.fromCharCode(...Array.from(salt)));
  const ivB64 = btoa(String.fromCharCode(...Array.from(iv)));

  return {
    blob: new Blob([encryptedBuffer], { type: "application/octet-stream" }),
    salt: saltB64,
    iv: ivB64,
  };
}

export async function decryptFile(blob: Blob, password: string, saltB64: string, ivB64: string, originalType: string): Promise<Blob> {
  const salt = new Uint8Array(atob(saltB64).split("").map((c) => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivB64).split("").map((c) => c.charCodeAt(0)));
  const key = await deriveKey(password, salt);

  const arrayBuffer = await blob.arrayBuffer();
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );

  return new Blob([decryptedBuffer], { type: originalType });
}

export async function wrapKey(secretToWrap: string, wrappingPassword: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(wrappingPassword, salt);
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(secretToWrap)
  );

  const saltB64 = btoa(String.fromCharCode(...Array.from(salt)));
  const ivB64 = btoa(String.fromCharCode(...Array.from(iv)));
  const encryptedB64 = btoa(String.fromCharCode(...Array.from(new Uint8Array(encryptedBuffer))));
  
  return `${saltB64}:${ivB64}:${encryptedB64}`;
}

export async function unwrapKey(wrappedString: string, wrappingPassword: string): Promise<string> {
  const parts = wrappedString.split(':');
  if (parts.length !== 3) throw new Error("Invalid wrapped key format");
  
  const salt = new Uint8Array(atob(parts[0]).split("").map((c) => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(parts[1]).split("").map((c) => c.charCodeAt(0)));
  const encrypted = new Uint8Array(atob(parts[2]).split("").map((c) => c.charCodeAt(0)));
  
  const key = await deriveKey(wrappingPassword, salt);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decryptedBuffer);
}
