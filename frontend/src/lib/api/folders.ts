import { Folder } from "../../types/domain";
import { apiRequest } from "./client";

export const folderApi = {
  list: (token: string) => apiRequest<{ folders: Folder[] }>("/folder/list", { method: "GET" }, { token }),

  create: (token: string, body: { name: string; password?: string }) =>
    apiRequest<Folder>("/folder/create", { method: "POST", body: JSON.stringify(body) }, { token }),

  lock: (token: string, folderId: number, password: string) =>
    apiRequest<Record<string, never>>(
      "/folder/lock",
      { method: "POST", body: JSON.stringify({ folder_id: folderId, password }) },
      { token }
    ),

  unlock: (token: string, folderId: number, password: string) =>
    apiRequest<Record<string, never>>(
      "/folder/unlock",
      { method: "POST", body: JSON.stringify({ folder_id: folderId, password }) },
      { token }
    ),

  delete: (token: string, folderId: number) =>
    apiRequest<Record<string, never>>(
      "/folder/delete",
      { method: "DELETE", body: JSON.stringify({ folder_id: folderId }) },
      { token }
    )
};
