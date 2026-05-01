import { SignJWT, jwtVerify } from "jose";
import type { Env, JwtPayloadShape } from "../types";
import { generateTokenId } from "./crypto";

const encoder = new TextEncoder();

function secretKey(env: Env): Uint8Array {
  return encoder.encode(env.JWT_SECRET);
}

export async function signAccessToken(env: Env, payload: { userId: number; email: string; sessionId: number }): Promise<string> {
  return new SignJWT({
    email: payload.email,
    sessionId: payload.sessionId,
    type: "access"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setJti(generateTokenId(16))
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey(env));
}

export async function signRefreshToken(env: Env, payload: { userId: number; email: string; sessionId: number }): Promise<string> {
  return new SignJWT({
    email: payload.email,
    sessionId: payload.sessionId,
    type: "refresh"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setJti(generateTokenId(24))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey(env));
}

export async function signDownloadToken(env: Env, payload: { userId: number; fileId: number }): Promise<string> {
  return new SignJWT({
    fileId: payload.fileId,
    type: "download"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setJti(generateTokenId(12))
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secretKey(env));
}

export async function verifyJwt<T extends JwtPayloadShape>(env: Env, token: string, expectedType: JwtPayloadShape["type"]) {
  const result = await jwtVerify(token, secretKey(env));
  const payload = result.payload as unknown as T;
  if (payload.type !== expectedType) {
    throw new Error("Invalid token type");
  }
  return payload;
}
