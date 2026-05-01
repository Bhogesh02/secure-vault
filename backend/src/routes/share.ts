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

async function createShareLink(context: AppContext): Promise<Response> {
  const body = await context.request.json<{ fileId?: number; folderId?: number; isOneTime?: boolean; expiresMinutes?: number }>();
  const userId = context.user!.userId;
  
  assert(body.fileId || body.folderId, "File or folder ID required", 400);
  
  const token = crypto.randomUUID();
  const expiresMinutes = body.expiresMinutes || 60;
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
  const isOneTime = body.isOneTime !== false ? 1 : 0;

  await context.env.DB.prepare(
    "INSERT INTO sharing_links (user_id, file_id, folder_id, token, is_one_time, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  )
    .bind(userId, body.fileId || null, body.folderId || null, token, isOneTime, expiresAt)
    .run();

  return jsonResponse(true, { token, expires_at: expiresAt }, "Sharing link generated");
}

async function accessSharedItem(context: AppContext, token: string): Promise<Response> {
  const link = await context.env.DB.prepare(
    "SELECT * FROM sharing_links WHERE token = ?1 LIMIT 1"
  )
    .bind(token)
    .first<{ id: number; user_id: number; file_id: number; folder_id: number; is_one_time: number; expires_at: string; accessed_count: number }>();

  assert(link, "Link not found or expired", 404);
  assert(new Date(link.expires_at).getTime() > Date.now(), "Link has expired", 410);
  
  if (link.is_one_time && link.accessed_count > 0) {
    return errorResponse("This one-time link has already been used", 410);
  }

  // Update access count
  await context.env.DB.prepare("UPDATE sharing_links SET accessed_count = accessed_count + 1 WHERE id = ?1").bind(link.id).run();

  // If it's a file, we need to return metadata for the frontend to then request the download
  // But wait, sharing encrypted items means the recipient needs the password too if it was encrypted.
  // The user should provide the decryption key separately or we embed it (less secure).
  // For now, let's return the item metadata.
  
  const responseData: any = { 
    type: link.file_id ? 'file' : 'folder', 
    expires_at: link.expires_at,
    is_one_time: link.is_one_time
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
