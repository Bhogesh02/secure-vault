import { withAuth } from "../middleware/auth";
import { verifySecret } from "../services/crypto";
import { signDownloadToken, verifyJwt } from "../services/jwt";
import type { AppContext } from "../types";
import { errorResponse, jsonResponse } from "../utils/response";
import { assert, parseJson } from "../utils/validation";

// Allowing all file types without restrictions

export async function handleFileRoutes(context: AppContext): Promise<Response | null> {
  const { pathname } = context.url;
  if (!pathname.startsWith("/file/")) return null;

  if (context.request.method === "GET" && pathname.startsWith("/file/download/")) {
    return downloadFile(context);
  }

  if (context.request.method === "POST" && pathname === "/file/upload") return withAuth(uploadFile)(context);
  if (context.request.method === "POST" && pathname === "/file/upload/start") return withAuth(startMultipartUpload)(context);
  if (context.request.method === "POST" && pathname === "/file/upload/part") return withAuth(uploadPart)(context);
  if (context.request.method === "POST" && pathname === "/file/upload/complete") return withAuth(completeMultipartUpload)(context);
  
  if (context.request.method === "GET" && pathname === "/file/list") return withAuth(listFiles)(context);
  if (context.request.method === "DELETE" && pathname === "/file/delete") return withAuth(deleteFile)(context);
  if (context.request.method === "DELETE" && pathname === "/file/purge") return withAuth(purgeFile)(context);
  if (context.request.method === "POST" && pathname === "/file/restore") return withAuth(restoreFile)(context);

  return null;
}

async function uploadFile(context: AppContext): Promise<Response> {
  const formData = await context.request.formData();
  const folderId = Number(formData.get("folder_id"));
  const file = formData.get("file");
  const encryptionSalt = formData.get("encryption_salt") as string | null;
  const encryptionIv = formData.get("encryption_iv") as string | null;

  assert(Number.isInteger(folderId) && folderId > 0, "folder_id must be a positive integer");
  assert(file instanceof File, "file is required");

  const folder = await context.env.DB.prepare(
    "SELECT id, is_locked, lock_password_hash FROM folders WHERE id = ?1 AND user_id = ?2 LIMIT 1"
  )
    .bind(folderId, context.user!.userId)
    .first<{ id: number; is_locked: number; lock_password_hash: string | null }>();
  assert(folder, "Folder not found", 404);
  await ensureFolderAccess(context, folder);

  const totalUsed = await context.env.DB.prepare("SELECT COALESCE(SUM(size), 0) as total FROM files WHERE user_id = ?1")
    .bind(context.user!.userId)
    .first<{ total: number }>();
  const limit = 2147483648; // 2GB
  assert((totalUsed?.total || 0) + file.size <= limit, "Storage limit reached (2GB Max)");

  const objectKey = `${context.user!.userId}/${folderId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  await context.env.VAULT_BUCKET.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  const result = await context.env.DB.prepare(
    "INSERT INTO files (user_id, folder_id, filename, file_url, size, content_type, encryption_salt, encryption_iv) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
  )
    .bind(context.user!.userId, folderId, file.name, objectKey, file.size, file.type, encryptionSalt, encryptionIv)
    .run();

  return jsonResponse(true, { id: result.meta.last_row_id, filename: file.name, size: file.size }, "File secured and uploaded", 201);
}
async function startMultipartUpload(context: AppContext): Promise<Response> {
  const body = await parseJson<{ filename: string; contentType: string; folderId: number; size: number }>(context.request);
  const userId = context.user!.userId;
  
  const totalUsed = await context.env.DB.prepare("SELECT COALESCE(SUM(size), 0) as total FROM files WHERE user_id = ?1")
    .bind(userId)
    .first<{ total: number }>();
  const limit = 2147483648; 
  assert((totalUsed?.total || 0) + body.size <= limit, "Storage limit reached (2GB Max)");

  const objectKey = `${userId}/${body.folderId}/${crypto.randomUUID()}-${sanitizeFilename(body.filename)}`;
  const upload = await context.env.VAULT_BUCKET.createMultipartUpload(objectKey, {
    httpMetadata: { contentType: body.contentType }
  });

  return jsonResponse(true, { uploadId: upload.uploadId, key: objectKey }, "Multipart upload started");
}

async function uploadPart(context: AppContext): Promise<Response> {
  const uploadId = context.url.searchParams.get("uploadId");
  const key = context.url.searchParams.get("key");
  const partNumber = Number(context.url.searchParams.get("partNumber"));
  
  assert(uploadId && key && partNumber, "Missing upload parameters");

  const upload = context.env.VAULT_BUCKET.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, context.request.body!);

  return jsonResponse(true, { etag: part.etag }, "Part uploaded");
}

async function completeMultipartUpload(context: AppContext): Promise<Response> {
  const body = await parseJson<{ uploadId: string; key: string; parts: { partNumber: number; etag: string }[]; filename: string; folderId: number; size: number; contentType: string; encryptionSalt?: string; encryptionIv?: string }>(context.request);
  
  const upload = context.env.VAULT_BUCKET.resumeMultipartUpload(body.key, body.uploadId);
  await upload.complete(body.parts);

  const result = await context.env.DB.prepare(
    "INSERT INTO files (user_id, folder_id, filename, file_url, size, content_type, encryption_salt, encryption_iv) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
  )
    .bind(context.user!.userId, body.folderId, body.filename, body.key, body.size, body.contentType, body.encryptionSalt, body.encryptionIv)
    .run();

  return jsonResponse(true, { id: result.meta.last_row_id }, "File upload completed and secured");
}

async function listFiles(context: AppContext): Promise<Response> {
  const folderId = Number(context.url.searchParams.get("folder_id"));
  const tab = context.url.searchParams.get("tab"); // "bin" | "recent" | "shared"
  const page = Math.max(1, Number(context.url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(context.url.searchParams.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  if (tab) {
    let query = "";
    if (tab === "bin") {
      query = "SELECT id, filename, size, created_at, deleted_at, content_type, encryption_salt, encryption_iv FROM files WHERE user_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?2 OFFSET ?3";
    } else if (tab === "recent") {
      query = "SELECT id, filename, size, created_at, content_type, encryption_salt, encryption_iv FROM files WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?2 OFFSET ?3";
    } else if (tab === "shared") {
      // Mock shared files for now
      return jsonResponse(true, { page, limit, files: [] }, "Shared files fetched");
    } else {
      return errorResponse("Invalid tab", 400);
    }
    
    try {
      const stmt = context.env.DB.prepare(query);
      const files = await stmt.bind(context.user!.userId, limit, offset).all<any>();
      return jsonResponse(true, { page, limit, files: files.results ?? [] }, "Files fetched");
    } catch (error: any) {
      console.error("D1 Query Error:", error.message);
      throw error;
    }
  }

  assert(Number.isInteger(folderId) && folderId >= 0, "folder_id must be a non-negative integer");

  if (folderId > 0) {
    const folder = await context.env.DB.prepare(
      "SELECT id, is_locked, lock_password_hash FROM folders WHERE id = ?1 AND user_id = ?2 LIMIT 1"
    )
      .bind(folderId, context.user!.userId)
      .first<{ id: number; is_locked: number; lock_password_hash: string | null }>();
    assert(folder, "Folder not found", 404);
    await ensureFolderAccess(context, folder);
  }

  const query = folderId === 0 
    ? "SELECT id, filename, size, created_at, content_type, encryption_salt, encryption_iv FROM files WHERE user_id = ?1 AND folder_id = 0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
    : "SELECT id, filename, size, created_at, content_type, encryption_salt, encryption_iv FROM files WHERE user_id = ?1 AND folder_id = ?2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?3 OFFSET ?4";

  try {
    const stmt = context.env.DB.prepare(query);
    const files = folderId === 0
      ? await stmt.bind(context.user!.userId, limit, offset).all<any>()
      : await stmt.bind(context.user!.userId, folderId, limit, offset).all<any>();

    return jsonResponse(true, { page, limit, files: files.results ?? [] }, "Files fetched");
  } catch (error: any) {
    console.error("D1 Query Error in listFiles:", error.message, error.stack);
    throw error;
  }
}

async function downloadFile(context: AppContext): Promise<Response> {
  const fileId = Number(context.url.pathname.split("/").pop());
  assert(Number.isInteger(fileId) && fileId > 0, "Invalid file id");

  const signedToken = context.url.searchParams.get("token");
  if (!signedToken) {
    return withAuth(async (ctx) => {
      const file = await ctx.env.DB.prepare(
        `SELECT files.id, folders.is_locked, folders.lock_password_hash FROM files LEFT JOIN folders ON folders.id = files.folder_id WHERE files.id = ?1 AND files.user_id = ?2 LIMIT 1`
      )
        .bind(fileId, ctx.user!.userId)
        .first<{ id: number; is_locked: number | null; lock_password_hash: string | null }>();
      assert(file, "File not found", 404);
      if (file.is_locked === 1) await ensureFolderAccess(ctx, { is_locked: 1, lock_password_hash: file.lock_password_hash });

      const token = await signDownloadToken(ctx.env, { userId: ctx.user!.userId, fileId });
      return jsonResponse(true, { download_url: `${ctx.env.APP_BASE_URL}/file/download/${fileId}?token=${encodeURIComponent(token)}` }, "Signed download URL generated");
    })(context);
  }

  let payload;
  try { payload = await verifyJwt(context.env, signedToken, "download"); } catch { return errorResponse("Invalid token", 401); }

  const file = await context.env.DB.prepare("SELECT id, user_id, filename, file_url, content_type FROM files WHERE id = ?1 LIMIT 1").bind(fileId).first<any>();
  assert(file && file.user_id === Number(payload.sub), "Access denied", 403);

  const object = await context.env.VAULT_BUCKET.get(file.file_url);
  assert(object, "File not found", 404);

  return new Response(object.body, { status: 200, headers: { "content-type": file.content_type, "cache-control": "private, max-age=60" } });
}

async function deleteFile(context: AppContext): Promise<Response> {
  const body = await parseJson<{ file_id: number }>(context.request);
  assert(Number.isInteger(body.file_id), "file_id must be an integer");

  const file = await context.env.DB.prepare(`SELECT files.id, files.file_url, folders.is_locked, folders.lock_password_hash FROM files LEFT JOIN folders ON folders.id = files.folder_id WHERE files.id = ?1 AND files.user_id = ?2 LIMIT 1`)
    .bind(body.file_id, context.user!.userId)
    .first<any>();
  assert(file, "File not found", 404);
  if (file.is_locked === 1) await ensureFolderAccess(context, { is_locked: 1, lock_password_hash: file.lock_password_hash });

  // Soft delete logic: mark file as deleted but do not remove from R2 yet
  await context.env.DB.prepare("UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2").bind(body.file_id, context.user!.userId).run();
  
  return jsonResponse(true, {}, "File moved to bin");
}

async function purgeFile(context: AppContext): Promise<Response> {
  const body = await parseJson<{ file_id: number }>(context.request);
  assert(Number.isInteger(body.file_id), "file_id must be an integer");

  const file = await context.env.DB.prepare(`SELECT files.id, files.file_url FROM files WHERE files.id = ?1 AND files.user_id = ?2 AND files.deleted_at IS NOT NULL LIMIT 1`)
    .bind(body.file_id, context.user!.userId)
    .first<any>();
  assert(file, "File not found in bin", 404);

  await context.env.VAULT_BUCKET.delete(file.file_url);
  await context.env.DB.prepare("DELETE FROM files WHERE id = ?1 AND user_id = ?2").bind(body.file_id, context.user!.userId).run();
  
  return jsonResponse(true, {}, "File permanently deleted");
}

async function restoreFile(context: AppContext): Promise<Response> {
  const body = await parseJson<{ file_id: number }>(context.request);
  assert(Number.isInteger(body.file_id), "file_id must be an integer");

  const file = await context.env.DB.prepare(`SELECT files.id FROM files WHERE files.id = ?1 AND files.user_id = ?2 AND files.deleted_at IS NOT NULL LIMIT 1`)
    .bind(body.file_id, context.user!.userId)
    .first<any>();
  assert(file, "File not found in bin", 404);

  await context.env.DB.prepare("UPDATE files SET deleted_at = NULL WHERE id = ?1 AND user_id = ?2").bind(body.file_id, context.user!.userId).run();
  
  return jsonResponse(true, {}, "File restored");
}

function sanitizeFilename(filename: string): string { return filename.replace(/[^a-zA-Z0-9._-]/g, "_"); }

async function ensureFolderAccess(context: AppContext, folder: { is_locked: number; lock_password_hash: string | null }): Promise<void> {
  if (folder.is_locked !== 1) return;
  const suppliedPassword = context.request.headers.get("x-folder-password");
  assert(suppliedPassword, "Password required", 423);
  const valid = await verifySecret(suppliedPassword, folder.lock_password_hash!);
  assert(valid, "Invalid password", 403);
}
