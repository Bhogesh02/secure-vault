import { hashSecret, sha256, verifySecret, generateTotpSecret, verifyTotp } from "../services/crypto";
import { signAccessToken, signRefreshToken, verifyJwt } from "../services/jwt";
import type { AppContext } from "../types";
import { withAuth, parseCookies } from "../middleware/auth";
import { errorResponse, jsonResponse } from "../utils/response";
import { assert, parseJson, validateEmail, validateMobile, validateOtp, validatePassword } from "../utils/validation";
import { APP_NAME } from "../constants";

type SignupBody = {
  email: string;
  mobile: string;
  password: string;
};

type VerifyOtpBody = {
  email: string;
  code: string;
};

type LoginBody = {
  email: string;
  password: string;
  mfa_code?: string;
  remember?: boolean;
};

function setAuthCookies(headers: Headers, accessToken: string, refreshToken: string, remember: boolean) {
  const maxAge = remember ? 60 * 60 * 24 * 7 : undefined; // 7 days if remember checked
  // Only use Secure if we're not on localhost (or if we want to force it)
  const isSecure = true; 
  const base = `HttpOnly; Secure; SameSite=None; Path=/`;
  
  headers.append("Set-Cookie", `vault_access_token=${accessToken}; ${base}`);
  headers.append("Set-Cookie", `vault_refresh_token=${refreshToken}; ${base}${maxAge ? `; Max-Age=${maxAge}` : ""}`);
}

type ForgotPasswordBody = {
  email: string;
};

type ResetPasswordBody = {
  email: string;
  code: string;
  new_password: string;
};

export async function handleAuthRoutes(context: AppContext): Promise<Response | null> {
  const { pathname } = context.url;

  if (context.request.method === "POST" && pathname === "/auth/signup") {
    return signup(context);
  }
  if (context.request.method === "POST" && pathname === "/auth/verify-otp") {
    return verifyOtp(context);
  }
  if (context.request.method === "POST" && pathname === "/auth/login") {
    return login(context);
  }
  if (context.request.method === "POST" && pathname === "/auth/refresh") {
    return refresh(context);
  }
  if (context.request.method === "POST" && pathname === "/auth/logout") {
    return logout(context);
  }

  if (context.request.method === "POST" && pathname === "/auth/forgot-password") {
    return forgotPassword(context);
  }
  if (context.request.method === "POST" && pathname === "/auth/reset-password") {
    return resetPassword(context);
  }
  if (context.request.method === "GET" && pathname === "/auth/me") {
    return withAuth(verifySession)(context);
  }

  return null;
}

async function signup(context: AppContext): Promise<Response> {
  const body = await parseJson<SignupBody>(context.request);
  const email = validateEmail(body.email);
  const mobile = validateMobile(body.mobile);
  const password = validatePassword(body.password);

  const existingUser = await context.env.DB.prepare(
    "SELECT id, is_verified FROM users WHERE email = ?1 OR mobile = ?2 LIMIT 1"
  )
    .bind(email, mobile)
    .first<{ id: number; is_verified: number }>();

  assert(!existingUser, "User already exists", 409);

  const totpSecret = generateTotpSecret();
  const passwordHash = await hashSecret(password);
  
  const result = await context.env.DB.prepare(
    "INSERT INTO users (email, mobile, password_hash, totp_secret, is_verified, is_totp_enabled) VALUES (?1, ?2, ?3, ?4, 0, 0)"
  )
    .bind(email, mobile, passwordHash, totpSecret)
    .run();

  return jsonResponse(
    true,
    { 
      user_id: result.meta.last_row_id, 
      email,
      totp_secret: totpSecret,
      otpauth_url: `otpauth://totp/${APP_NAME}:${email}?secret=${totpSecret}&issuer=${APP_NAME}`
    },
    "Signup successful. Link your Authenticator app using the secret provided.",
    201
  );
}

async function verifyOtp(context: AppContext): Promise<Response> {
  const body = await parseJson<VerifyOtpBody>(context.request);
  const email = validateEmail(body.email);
  const code = body.code;

  const user = await context.env.DB.prepare(
    "SELECT id, totp_secret FROM users WHERE email = ?1 LIMIT 1"
  )
    .bind(email)
    .first<{ id: number; totp_secret: string }>();

  assert(user, "User not found", 404);
  
  const isValid = await verifyTotp(user.totp_secret, code);
  assert(isValid, "Invalid Authenticator code", 400);

  await context.env.DB.prepare("UPDATE users SET is_verified = 1, is_totp_enabled = 1 WHERE id = ?1").bind(user.id).run();

  return jsonResponse(true, {}, "Authenticator linked successfully");
}

async function login(context: AppContext): Promise<Response> {
  const body = await parseJson<LoginBody>(context.request);
  const email = validateEmail(body.email);
  const password = body.password;

  const user = await context.env.DB.prepare(
    "SELECT id, email, password_hash, is_verified, is_locked, failed_attempts, max_failed_attempts, totp_secret, is_totp_enabled FROM users WHERE email = ?1 LIMIT 1"
  )
    .bind(email)
    .first<{ id: number; email: string; password_hash: string; is_verified: number; is_locked: number; failed_attempts: number; max_failed_attempts: number; totp_secret: string; is_totp_enabled: number }>();

  const ip = context.request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const userAgent = context.request.headers.get("user-agent") ?? "Unknown";

  if (!user) {
    // Log anonymous failed attempt? Maybe too noisy.
    return errorResponse("Invalid email or password", 401);
  }

  if (user.is_locked) {
    await context.env.DB.prepare(
      "INSERT INTO security_logs (user_id, event_type, ip_address, user_agent, details) VALUES (?1, 'login_blocked_locked', ?2, ?3, 'Account is currently locked')"
    ).bind(user.id, ip, userAgent).run();
    return errorResponse("Account is locked due to too many failed attempts. Please reset your password.", 403);
  }

  assert(user.is_verified === 1, "Please verify your email before logging in", 403);

  const validPassword = await verifySecret(password, user.password_hash);
  
  if (!validPassword) {
    const newFailedAttempts = user.failed_attempts + 1;
    const shouldLock = newFailedAttempts >= user.max_failed_attempts;
    
    await context.env.DB.batch([
      context.env.DB.prepare("UPDATE users SET failed_attempts = ?1, is_locked = ?2 WHERE id = ?3").bind(newFailedAttempts, shouldLock ? 1 : 0, user.id),
      context.env.DB.prepare("INSERT INTO security_logs (user_id, event_type, ip_address, user_agent, details) VALUES (?1, 'login_failed', ?2, ?3, ?4)")
        .bind(user.id, ip, userAgent, `Failed attempt ${newFailedAttempts}${shouldLock ? ' - ACCOUNT LOCKED' : ''}`)
    ]);

    if (shouldLock) {
      return errorResponse("Too many failed attempts. Your account has been locked.", 403);
    }
    return errorResponse("Invalid email or password", 401);
  }

  // MFA Check
  if (user.is_totp_enabled) {
    if (!body.mfa_code) {
      return jsonResponse(true, { mfa_required: true }, "MFA code required", 200);
    }
    const isMfaValid = await verifyTotp(user.totp_secret, body.mfa_code);
    if (!isMfaValid) {
      return errorResponse("Invalid Authenticator code", 401);
    }
  }

  // Success - reset failed attempts and update last active
  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE users SET failed_attempts = 0, last_active_at = CURRENT_TIMESTAMP WHERE id = ?1").bind(user.id),
    context.env.DB.prepare("INSERT INTO security_logs (user_id, event_type, ip_address, user_agent, details) VALUES (?1, 'login_success', ?2, ?3, 'Successful login')")
      .bind(user.id, ip, userAgent)
  ]);

  const sessionInsert = await context.env.DB.prepare(
    "INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES (?1, ?2, ?3)"
  )
    .bind(user.id, "pending", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
    .run();

  const accessToken = await signAccessToken(context.env, { userId: user.id, email: user.email, sessionId: sessionInsert.meta.last_row_id });
  const refreshToken = await signRefreshToken(context.env, { userId: user.id, email: user.email, sessionId: sessionInsert.meta.last_row_id });
  const refreshHash = await sha256(refreshToken);

  await context.env.DB.prepare("UPDATE sessions SET refresh_token_hash = ?1 WHERE id = ?2")
    .bind(refreshHash, sessionInsert.meta.last_row_id)
    .run();

  const headers = new Headers();
  setAuthCookies(headers, accessToken, refreshToken, !!body.remember);

  return jsonResponse(true, {
    user: {
      id: user.id,
      email: user.email
    }
  }, "Login successful", 200, headers);
}

async function refresh(context: AppContext): Promise<Response> {
  const cookies = parseCookies(context.request.headers.get("cookie"));
  const refreshToken = cookies["vault_refresh_token"];
  assert(refreshToken, "Refresh token is required", 401);

  let payload;
  try {
    payload = await verifyJwt(context.env, refreshToken, "refresh");
  } catch {
    return errorResponse("Invalid or expired refresh token", 401);
  }

  const session = await context.env.DB.prepare(
    "SELECT id, user_id, refresh_token_hash, expires_at FROM sessions WHERE id = ?1 AND user_id = ?2 LIMIT 1"
  )
    .bind(payload.sessionId, Number(payload.sub))
    .first<{ id: number; user_id: number; refresh_token_hash: string; expires_at: string }>();

  assert(session, "Session not found", 401);
  assert(new Date(session.expires_at).getTime() > Date.now(), "Refresh token has expired", 401);

  const incomingHash = await sha256(refreshToken);
  assert(incomingHash === session.refresh_token_hash, "Refresh token mismatch", 401);

  const accessToken = await signAccessToken(context.env, {
    userId: session.user_id,
    email: payload.email,
    sessionId: session.id
  });
  const nextRefreshToken = await signRefreshToken(context.env, {
    userId: session.user_id,
    email: payload.email,
    sessionId: session.id
  });
  const nextRefreshHash = await sha256(nextRefreshToken);

  await context.env.DB.prepare(
    "UPDATE sessions SET refresh_token_hash = ?1, expires_at = ?2 WHERE id = ?3"
  )
    .bind(nextRefreshHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), session.id)
    .run();

  const headers = new Headers();
  setAuthCookies(headers, accessToken, nextRefreshToken, true); // Keep alive

  return jsonResponse(true, {}, "Token refreshed", 200, headers);
}


async function forgotPassword(context: AppContext): Promise<Response> {
  const body = await parseJson<ForgotPasswordBody>(context.request);
  const email = validateEmail(body.email);

  const user = await context.env.DB.prepare("SELECT id, is_totp_enabled FROM users WHERE email = ?1 LIMIT 1").bind(email).first<{ id: number; is_totp_enabled: number }>();
  if (!user) {
    return jsonResponse(true, {}, "Recovery process initiated");
  }

  if (!user.is_totp_enabled) {
    return errorResponse("Account recovery requires an Authenticator app. Please contact support.", 403);
  }

  return jsonResponse(true, { mfa_required: true }, "Please enter your Authenticator code to reset password");
}

async function resetPassword(context: AppContext): Promise<Response> {
  const body = await parseJson<ResetPasswordBody>(context.request);
  const email = validateEmail(body.email);
  const code = body.code;
  const newPassword = validatePassword(body.new_password);

  const user = await context.env.DB.prepare(
    "SELECT id, totp_secret, is_totp_enabled FROM users WHERE email = ?1 LIMIT 1"
  )
    .bind(email)
    .first<{ id: number; totp_secret: string; is_totp_enabled: number }>();

  assert(user && user.is_totp_enabled, "Authenticator not linked", 400);

  const isValid = await verifyTotp(user.totp_secret, code);
  assert(isValid, "Invalid Authenticator code", 401);

  const passwordHash = await hashSecret(newPassword);
  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE users SET password_hash = ?1, is_locked = 0, failed_attempts = 0 WHERE email = ?2").bind(passwordHash, email),
    context.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(user.id),
    context.env.DB.prepare("INSERT INTO security_logs (user_id, event_type, details) VALUES (?1, 'password_reset', 'Password reset via Authenticator')").bind(user.id)
  ]);

  return jsonResponse(true, {}, "Password reset successfully");
}

async function logout(context: AppContext): Promise<Response> {
  const cookies = parseCookies(context.request.headers.get("cookie"));
  const refreshToken = cookies["vault_refresh_token"];
  
  if (refreshToken) {
    try {
      const payload = await verifyJwt(context.env, refreshToken, "refresh");
      await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?1 AND user_id = ?2")
        .bind(payload.sessionId, Number(payload.sub))
        .run();
    } catch {
      // Ignore invalid token during logout
    }
  }

  const headers = new Headers();
  const base = "HttpOnly; Secure; SameSite=None; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  headers.append("Set-Cookie", `vault_access_token=; ${base}`);
  headers.append("Set-Cookie", `vault_refresh_token=; ${base}`);
  
  return jsonResponse(true, {}, "Logged out successfully", 200, headers);
}

async function verifySession(context: AppContext): Promise<Response> {
  const { userId, email } = context.user!;
  return jsonResponse(true, { user: { id: userId, email } }, "Session valid");
}
