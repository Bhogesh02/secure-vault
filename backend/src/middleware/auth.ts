import { verifyJwt } from "../services/jwt";
import type { AppContext } from "../types";
import { errorResponse } from "../utils/response";

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(cookie => {
    const [name, ...rest] = cookie.split("=");
    cookies[name.trim()] = rest.join("=").trim();
  });
  return cookies;
}

/**
 * Middleware to require authentication.
 * Populates context.user with payload data.
 */
export async function requireAuth(context: AppContext): Promise<Response | null> {
  let token = "";
  const authHeader = context.request.headers.get("authorization");
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length);
  } else {
    const cookies = parseCookies(context.request.headers.get("cookie"));
    token = cookies["vault_access_token"] || "";
  }

  if (!token) {
    return errorResponse("Missing or invalid authorization token", 401);
  }

  try {
    const payload = await verifyJwt(context.env, token, "access");
    if (!payload.sub || !payload.email) {
      return errorResponse("Invalid token payload", 401);
    }
    
    context.user = {
      userId: Number(payload.sub),
      email: payload.email,
      sessionId: payload.sessionId
    };
    return null;
  } catch (error) {
    console.warn("Auth middleware failed:", error instanceof Error ? error.message : "Unknown error");
    return errorResponse("Invalid or expired access token", 401);
  }
}

/**
 * Higher-order function to wrap handlers with authentication.
 */
export function withAuth(handler: (context: AppContext) => Promise<Response>) {
  return async (context: AppContext) => {
    const authError = await requireAuth(context);
    if (authError) return authError;
    return handler(context);
  };
}
