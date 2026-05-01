import { apiRequest } from "./client";

export type UserStats = {
  total_size: number;
  file_count: number;
  storage_limit: number;
};

export const userApi = {
  getStats: (token: string) => apiRequest<UserStats>("/user/stats", { method: "GET" }, { token })
};
