import { enforceRateLimit } from "./middleware/rateLimit";
import { handleAuthRoutes } from "./routes/auth";
import { handleFileRoutes } from "./routes/file";
import { handleFolderRoutes } from "./routes/folder";
import { handleShareRoutes } from "./routes/share";
import { handleUserRoutes } from "./routes/user";
import { sendDeadManEmail } from "./services/email";
import type { AppContext, Env } from "./types";
import { errorResponse, jsonResponse, noContentResponse } from "./utils/response";
import { handleRouteError } from "./utils/validation";

const securityHeaders: HeadersInit = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none';"
};

function getAllowedOrigin(env: Env, request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (allowed.includes("*")) {
    return origin;
  }

  return allowed.includes(origin) ? origin : null;
}

function withCommonHeaders(response: Response, env: Env, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = getAllowedOrigin(env, request);

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ?? "Content-Type, Authorization, x-folder-password"
  );
  headers.set("access-control-max-age", "86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function createContext(request: Request, env: Env): AppContext {
  const url = new URL(request.url);
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  return { env, request, url, ip };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCommonHeaders(noContentResponse(), env, request);
    }

    const context = createContext(request, env);
    const rateLimitError = await enforceRateLimit(context);
    if (rateLimitError) {
      return withCommonHeaders(rateLimitError, env, request);
    }

    try {
      const routeResponse =
        (await handleAuthRoutes(context)) ??
        (await handleFolderRoutes(context)) ??
        (await handleFileRoutes(context)) ??
        (await handleShareRoutes(context)) ??
        (await handleUserRoutes(context));

      const response = routeResponse ?? jsonResponse(false, null, "Route not found", 404);
      return withCommonHeaders(response, env, request);
    } catch (error) {
      return withCommonHeaders(handleRouteError(error), env, request);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          // 1. Purge deleted files after 15 days
          const filesToPurge = await env.DB.prepare(
            "SELECT id, file_url FROM files WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-15 days')"
          ).all<{ id: number; file_url: string }>();

          if (filesToPurge.results && filesToPurge.results.length > 0) {
            for (const file of filesToPurge.results) {
              try {
                await env.VAULT_BUCKET.delete(file.file_url);
                await env.DB.prepare("DELETE FROM files WHERE id = ?1").bind(file.id).run();
              } catch (err) {
                console.error(`Failed to purge file ${file.id}:`, err);
              }
            }
            console.log(`Successfully purged ${filesToPurge.results.length} files from bin.`);
          }

          // 2. Dead Man Switch Check
          const inactiveUsers = await env.DB.prepare(`
            SELECT id, email, dead_man_email, dead_man_days 
            FROM users 
            WHERE dead_man_email IS NOT NULL 
            AND last_active_at < datetime('now', '-' || dead_man_days || ' days')
          `).all<{ id: number; email: string; dead_man_email: string; dead_man_days: number }>();

          if (inactiveUsers.results && inactiveUsers.results.length > 0) {
            for (const user of inactiveUsers.results) {
              console.warn(`[DEAD MAN SWITCH] User ${user.email} inactive for ${user.dead_man_days} days. Alerting ${user.dead_man_email}...`);
              await sendDeadManEmail(env, user.dead_man_email, user.email);
              
              // Prevent re-triggering by clearing the dead_man_email or setting a flag
              // For now, we clear it to ensure it only fires once.
              await env.DB.prepare("UPDATE users SET dead_man_email = NULL WHERE id = ?1").bind(user.id).run();
            }
          }
        } catch (error) {
          console.error("Scheduled worker error:", error);
        }
      })()
    );
  }
};
