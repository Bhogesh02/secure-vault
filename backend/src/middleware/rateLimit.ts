import type { AppContext } from "../types";
import { errorResponse } from "../utils/response";

type WindowEntry = {
  count: number;
  resetAt: number;
};

// Memory-based bucket (Cloudflare Worker isolates will have separate buckets, which is fine for local protection)
const buckets = new Map<string, WindowEntry>();

const LIMITS = {
  AUTH: { limit: 5, windowMs: 15 * 60_000 }, // 5 attempts per 15 mins (Login/Signup)
  GENERAL: { limit: 100, windowMs: 60_000 }, // 100 requests per minute
};

export async function enforceRateLimit(context: AppContext): Promise<Response | null> {
  const path = context.url.pathname;
  const isAuth = path.startsWith("/auth/");
  const config = isAuth ? LIMITS.AUTH : LIMITS.GENERAL;
  
  const key = `${context.ip}:${isAuth ? 'auth' : 'gen'}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  if (current.count >= config.limit) {
    // Log security event for audit
    console.warn(`[SECURITY] Rate limit hit for IP ${context.ip} on path ${path}`);
    
    // In production, we'd log this to D1
    try {
      context.env.DB.prepare(
        "INSERT INTO security_logs (event_type, ip_address, metadata) VALUES (?1, ?2, ?3)"
      ).bind('rate_limit_hit', context.ip, JSON.stringify({ path, count: current.count })).run();
    } catch (e) {
      // Ignore DB errors in rate limiter to prevent blocking
    }

    return errorResponse("Too many requests. Please try again later.", 429);
  }

  current.count += 1;
  buckets.set(key, current);
  return null;
}
