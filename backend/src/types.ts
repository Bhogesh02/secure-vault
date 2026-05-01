export interface Env {
  DB: D1Database;
  VAULT_BUCKET: R2Bucket;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  APP_BASE_URL: string;
  ALLOWED_ORIGINS?: string;
  MAX_FILE_SIZE_BYTES?: string;
}

export interface AuthenticatedUser {
  userId: number;
  email: string;
  sessionId?: number;
}

export interface AppContext {
  env: Env;
  request: Request;
  url: URL;
  ip: string;
  user?: AuthenticatedUser;
}

export interface JwtPayloadShape {
  sub: string;
  email: string;
  type: "access" | "refresh" | "download";
  sessionId?: number;
  fileId?: number;
}
