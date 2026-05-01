import { apiRequest } from "./client";

export const securityApi = {
  getLogs: (token: string) => 
    apiRequest<any[]>("/user/security-logs", {}, { token }),
    
  getSettings: (token: string) => 
    apiRequest<any>("/user/security-settings", {}, { token }),
    
  updateSettings: (token: string, settings: { max_failed_attempts?: number; dead_man_email?: string; dead_man_days?: number }) =>
    apiRequest<any>("/user/security-settings", { 
      method: "POST", 
      body: JSON.stringify(settings) 
    }, { token }),
};

export const shareApi = {
  createLink: (token: string, data: { fileId?: number; folderId?: number; isOneTime?: boolean; expiresMinutes?: number; accessLevel?: 'view' | 'download' | 'both'; password?: string; wrappedKey?: string; }) =>
    apiRequest<{ token: string; expires_at: string }>("/share/create", {
      method: "POST",
      body: JSON.stringify(data)
    }, { token }),
    
  accessLink: (token: string, password?: string) => {
    const headers: Record<string, string> = {};
    if (password) {
      headers["x-share-password"] = password;
    }
    return apiRequest<any>(`/share/access/${token}`, { headers });
  }
};
