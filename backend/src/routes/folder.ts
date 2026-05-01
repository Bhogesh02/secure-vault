import { withAuth } from "../middleware/auth";
import { hashSecret, verifySecret } from "../services/crypto";
import type { AppContext } from "../types";
import { jsonResponse } from "../utils/response";
import { assert, parseJson, validateFolderName, validateFolderPassword } from "../utils/validation";

type CreateFolderBody = {
  name: string;
  password?: string;
};

type FolderActionBody = {
  folder_id: number;
  password?: string;
};

export async function handleFolderRoutes(context: AppContext): Promise<Response | null> {
  const { pathname } = context.url;
  if (!pathname.startsWith("/folder/")) return null;

  if (context.request.method === "POST" && pathname === "/folder/create") return withAuth(createFolder)(context);
  if (context.request.method === "GET" && pathname === "/folder/list") return withAuth(listFolders)(context);
  if (context.request.method === "POST" && pathname === "/folder/lock") return withAuth(lockFolder)(context);
  if (context.request.method === "POST" && pathname === "/folder/unlock") return withAuth(unlockFolder)(context);
  if (context.request.method === "DELETE" && pathname === "/folder/delete") return withAuth(deleteFolder)(context);

  return null;
}

async function createFolder(context: AppContext): Promise<Response> {
  const body = await parseJson<CreateFolderBody>(context.request);
  const name = validateFolderName(body.name);
  const passwordHash = body.password ? await hashSecret(validateFolderPassword(body.password)) : null;

  const result = await context.env.DB.prepare(
    "INSERT INTO folders (user_id, name, is_locked, lock_password_hash) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(context.user!.userId, name, passwordHash ? 1 : 0, passwordHash)
    .run();

  return jsonResponse(true, {
    id: result.meta.last_row_id,
    name,
    is_locked: Boolean(passwordHash)
  }, "Folder created", 201);
}

async function listFolders(context: AppContext): Promise<Response> {
  const rows = await context.env.DB.prepare(`
    SELECT f.id, f.name, f.is_locked, f.created_at, COALESCE(SUM(fi.size), 0) as total_size
    FROM folders f
    LEFT JOIN files fi ON f.id = fi.folder_id AND fi.deleted_at IS NULL
    WHERE f.user_id = ?1 AND f.deleted_at IS NULL
    GROUP BY f.id
    ORDER BY f.created_at DESC
  `)
    .bind(context.user!.userId)
    .all<{ id: number; name: string; is_locked: number; created_at: string; total_size: number }>();

  return jsonResponse(true, { folders: rows.results ?? [] }, "Folders fetched");
}

async function lockFolder(context: AppContext): Promise<Response> {
  const body = await parseJson<FolderActionBody>(context.request);
  assert(Number.isInteger(body.folder_id), "folder_id must be an integer");
  const password = validateFolderPassword(body.password ?? "");

  await assertOwnedFolder(context, body.folder_id);
  const hash = await hashSecret(password);

  await context.env.DB.prepare(
    "UPDATE folders SET is_locked = 1, lock_password_hash = ?1 WHERE id = ?2 AND user_id = ?3"
  )
    .bind(hash, body.folder_id, context.user!.userId)
    .run();

  return jsonResponse(true, {}, "Folder locked");
}

async function unlockFolder(context: AppContext): Promise<Response> {
  const body = await parseJson<FolderActionBody>(context.request);
  assert(Number.isInteger(body.folder_id), "folder_id must be an integer");
  assert(typeof body.password === "string" && body.password.length > 0, "Folder password is required");

  const folder = await assertOwnedFolder(context, body.folder_id);
  assert(folder.is_locked === 1, "Folder is not locked");
  assert(folder.lock_password_hash, "Folder lock password missing", 500);

  const valid = await verifySecret(body.password, folder.lock_password_hash);
  assert(valid, "Invalid folder password", 403);

  return jsonResponse(true, {}, "Folder unlocked");
}

async function deleteFolder(context: AppContext): Promise<Response> {
  const body = await parseJson<FolderActionBody>(context.request);
  assert(Number.isInteger(body.folder_id), "folder_id must be an integer");
  await assertOwnedFolder(context, body.folder_id);

  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE folder_id = ?1 AND user_id = ?2").bind(body.folder_id, context.user!.userId),
    context.env.DB.prepare("UPDATE folders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2").bind(body.folder_id, context.user!.userId)
  ]);

  return jsonResponse(true, {}, "Folder moved to bin");
}

async function assertOwnedFolder(context: AppContext, folderId: number) {
  const folder = await context.env.DB.prepare(
    "SELECT id, is_locked, lock_password_hash FROM folders WHERE id = ?1 AND user_id = ?2 LIMIT 1"
  )
    .bind(folderId, context.user!.userId)
    .first<{ id: number; is_locked: number; lock_password_hash: string | null }>();

  assert(folder, "Folder not found", 404);
  return folder;
}
