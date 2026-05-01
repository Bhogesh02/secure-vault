import { withAuth } from "../middleware/auth";
import type { AppContext } from "../types";
import { jsonResponse, errorResponse } from "../utils/response";
import { assert } from "../utils/validation";

export async function handleShareRoutes(context: AppContext): Promise<Response | null> {
  const { pathname } = context.url;

  if (context.request.method === "POST" && pathname === "/share/create") {
    return withAuth(createShareLink)(context);
  }
  
  if (context.request.method === "GET" && pathname.startsWith("/share/access/")) {
    const token = pathname.split("/").pop();
    if (token) return accessSharedItem(context, token);
  }

  return null;
}

import { hashSecret, verifySecret } from "../services/crypto";

async function createShareLink(context: AppContext): Promise<Response> {
  const body = await context.request.json<{ 
    fileId?: number; 
    folderId?: number; 
    isOneTime?: boolean; 
    expiresMinutes?: number;
    accessLevel?: 'view' | 'download' | 'both';
    password?: string;
    wrappedKey?: string;
  }>();
  const userId = context.user!.userId;
  
  assert(body.fileId || body.folderId, "File or folder ID required", 400);
  
  const token = crypto.randomUUID();
  const expiresMinutes = body.expiresMinutes || 60;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  const isOneTime = body.isOneTime !== false ? 1 : 0;
  const accessLevel = body.accessLevel || 'both';
  
  let passwordHash = null;
  if (body.password) {
    passwordHash = await hashSecret(body.password);
  }

  await context.env.DB.prepare(
    "INSERT INTO sharing_links (user_id, file_id, folder_id, token, is_one_time, expires_at, access_level, password_hash, wrapped_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
  )
    .bind(userId, body.fileId || null, body.folderId || null, token, isOneTime, expiresAt, accessLevel, passwordHash, body.wrappedKey || null)
    .run();

  return jsonResponse(true, { token, expires_at: expiresAt }, "Sharing link generated");
}

async function accessSharedItem(context: AppContext, token: string): Promise<Response> {
  const link = await context.env.DB.prepare(
    "SELECT * FROM sharing_links WHERE token = ?1 LIMIT 1"
  )
    .bind(token)
    .first<{ id: number; user_id: number; file_id: number; folder_id: number; is_one_time: number; expires_at: string; accessed_count: number; access_level: string; password_hash: string | null; wrapped_key: string | null }>();

  assert(link, "Link not found or expired", 404);
  assert(new Date(link.expires_at).getTime() > Date.now(), "Link has expired", 410);
  
  if (link.is_one_time && link.accessed_count > 0) {
    return errorResponse("This one-time link has already been used", 410);
  }

  if (link.password_hash) {
    const suppliedPassword = context.request.headers.get("x-share-password");
    if (!suppliedPassword) {
      return jsonResponse(true, { passwordRequired: true }, "Password required", 200);
    }
    const isValid = await verifySecret(suppliedPassword, link.password_hash);
    if (!isValid) {
      return errorResponse("Invalid password", 401);
    }
  }

  const responseData: any = { 
    type: link.file_id ? 'file' : 'folder', 
    expires_at: link.expires_at,
    is_one_time: link.is_one_time,
    access_level: link.access_level,
    wrapped_key: link.wrapped_key
  };

  if (link.file_id) {
    const file = await context.env.DB.prepare("SELECT * FROM files WHERE id = ?1").bind(link.file_id).first();
    responseData.item = file;
  } else {
    const folder = await context.env.DB.prepare("SELECT * FROM folders WHERE id = ?1").bind(link.folder_id).first();
    const files = await context.env.DB.prepare("SELECT * FROM files WHERE folder_id = ?1").bind(link.folder_id).all();
    responseData.item = folder;
    responseData.files = files.results;
  }

  return jsonResponse(true, responseData, "Shared item accessed");
}
