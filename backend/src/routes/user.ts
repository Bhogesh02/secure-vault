import { withAuth } from "../middleware/auth";
import type { AppContext } from "../types";
import { errorResponse, jsonResponse } from "../utils/response";

export async function handleUserRoutes(context: AppContext): Promise<Response | null> {
  const { pathname } = context.url;
  
  if (context.request.method === "GET" && pathname === "/user/stats") {
    return withAuth(getUserStats)(context);
  }
  if (context.request.method === "GET" && pathname === "/user/security-logs") {
    return withAuth(getSecurityLogs)(context);
  }
  if (context.request.method === "GET" && pathname === "/user/security-settings") {
    return withAuth(getSecuritySettings)(context);
  }
  if (context.request.method === "POST" && pathname === "/user/security-settings") {
    return withAuth(updateSecuritySettings)(context);
  }

  return null;
}

async function getUserStats(context: AppContext): Promise<Response> {
  const userId = context.user!.userId;
  const stats = await context.env.DB.prepare(
    "SELECT COALESCE(SUM(size), 0) as total_size, COUNT(*) as file_count FROM files WHERE user_id = ?1"
  )
    .bind(userId)
    .first<{ total_size: number; file_count: number }>();

  const userSettings = await context.env.DB.prepare(
    "SELECT last_active_at, dead_man_email, dead_man_days FROM users WHERE id = ?1"
  ).bind(userId).first<{ last_active_at: string; dead_man_email: string; dead_man_days: number }>();

  return jsonResponse(true, {
    total_size: stats?.total_size || 0,
    file_count: stats?.file_count || 0,
    storage_limit: 2147483648, // 2GB
    last_active_at: userSettings?.last_active_at,
    dead_man_email: userSettings?.dead_man_email,
    dead_man_days: userSettings?.dead_man_days
  }, "User stats fetched");
}

async function getSecurityLogs(context: AppContext): Promise<Response> {
  const logs = await context.env.DB.prepare(
    "SELECT event_type, ip_address, user_agent, details, created_at FROM security_logs WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50"
  )
    .bind(context.user!.userId)
    .all<{ event_type: string; ip_address: string; user_agent: string; details: string; created_at: string }>();

  return jsonResponse(true, logs.results, "Security logs fetched");
}

async function getSecuritySettings(context: AppContext): Promise<Response> {
  const settings = await context.env.DB.prepare(
    "SELECT max_failed_attempts, dead_man_email, dead_man_days FROM users WHERE id = ?1"
  )
    .bind(context.user!.userId)
    .first();

  return jsonResponse(true, settings, "Security settings fetched");
}

async function updateSecuritySettings(context: AppContext): Promise<Response> {
  const body = await context.request.json<{ max_failed_attempts?: number; dead_man_email?: string; dead_man_days?: number }>();
  const userId = context.user!.userId;

  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (body.max_failed_attempts !== undefined) {
    updates.push(`max_failed_attempts = ?${paramIndex++}`);
    params.push(Math.max(1, Math.min(10, body.max_failed_attempts)));
  }
  if (body.dead_man_email !== undefined) {
    updates.push(`dead_man_email = ?${paramIndex++}`);
    params.push(body.dead_man_email);
  }
  if (body.dead_man_days !== undefined) {
    updates.push(`dead_man_days = ?${paramIndex++}`);
    params.push(Math.max(1, Math.min(365, body.dead_man_days)));
  }

  if (updates.length === 0) {
    return errorResponse("No updates provided", 400);
  }

  params.push(userId);
  await context.env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")}, last_active_at = CURRENT_TIMESTAMP WHERE id = ?${paramIndex}`
  ).bind(...params).run();

  return jsonResponse(true, {}, "Security settings updated");
}
