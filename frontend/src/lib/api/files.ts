import { VaultFile } from "../../types/domain";
import { apiRequest } from "./client";

export const fileApi = {
  list: (token: string, folderId: number, folderPassword?: string, tab?: string) => {
    let url = `/file/list?folder_id=${folderId}&page=1&limit=50`;
    if (tab) url += `&tab=${tab}`;
    return apiRequest<{ page: number; limit: number; files: VaultFile[] }>(
      url,
      { method: "GET" },
      { token, folderPassword }
    );
  },

  upload: (token: string, folderId: number, file: File | Blob, folderPassword?: string, metadata?: { salt: string; iv: string }) => {
    const formData = new FormData();
    formData.set("folder_id", String(folderId));
    formData.set("file", file);
    if (metadata) {
      formData.set("encryption_salt", metadata.salt);
      formData.set("encryption_iv", metadata.iv);
    }
    return apiRequest<{ id: number; filename: string; size: number }>(
      "/file/upload",
      { method: "POST", body: formData },
      { token, folderPassword }
    );
  },

  startMultipart: (token: string, data: { filename: string; contentType: string; folderId: number; size: number }) =>
    apiRequest<{ uploadId: string; key: string }>("/file/upload/start", { method: "POST", body: JSON.stringify(data) }, { token }),

  uploadPart: (token: string, uploadId: string, key: string, partNumber: number, body: Blob) =>
    apiRequest<{ etag: string }>(`/file/upload/part?uploadId=${uploadId}&key=${key}&partNumber=${partNumber}`, { method: "POST", body }, { token }),

  completeMultipart: (token: string, data: { uploadId: string; key: string; parts: { partNumber: number; etag: string }[]; filename: string; folderId: number; size: number; contentType: string; encryptionSalt?: string; encryptionIv?: string }) =>
    apiRequest<{ id: number }>("/file/upload/complete", { method: "POST", body: JSON.stringify(data) }, { token }),

  createDownloadUrl: (token: string, fileId: number, folderPassword?: string) =>
    apiRequest<{ download_url: string }>(`/file/download/${fileId}`, { method: "GET" }, { token, folderPassword }),

  downloadBlob: async (downloadUrl: string) => {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error("Download failed");
    }
    return response.blob();
  },

  delete: (token: string, fileId: number, folderPassword?: string) =>
    apiRequest<Record<string, never>>(
      "/file/delete",
      { method: "DELETE", body: JSON.stringify({ file_id: fileId }) },
      { token, folderPassword }
    ),

  purge: (token: string, fileId: number) =>
    apiRequest<Record<string, never>>(
      "/file/purge",
      { method: "DELETE", body: JSON.stringify({ file_id: fileId }) },
      { token }
    ),

  restore: (token: string, fileId: number) =>
    apiRequest<Record<string, never>>(
      "/file/restore",
      { method: "POST", body: JSON.stringify({ file_id: fileId }) },
      { token }
    )
};
