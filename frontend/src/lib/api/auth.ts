import { Session, User } from "../../types/domain";
import { apiRequest } from "./client";

export const authApi = {
  signup: (body: { email: string; mobile: string; password: string }) =>
    apiRequest<{ user_id: number; email: string; totp_secret: string; otpauth_url: string }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),

  verifyOtp: (body: { email: string; code: string }) =>
    apiRequest<Record<string, never>>("/auth/verify-otp", { method: "POST", body: JSON.stringify(body) }),

  login: async (body: { email: string; password: string; mfa_code?: string; remember?: boolean }): Promise<any> => {
    return await apiRequest<{ user: User; mfa_required?: boolean }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  refresh: (refreshToken: string) =>
    apiRequest<{ access_token: string; refresh_token: string }>("/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }),

  logout: () =>
    apiRequest<Record<string, never>>("/auth/logout", { method: "POST" }),

  forgotPassword: (email: string) =>
    apiRequest<{ mfa_required: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (body: { email: string; code: string; new_password: string }) => {
    return apiRequest<null>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) });
  },

  verifySession: (token: string) => {
    return apiRequest<{ user: { id: number; email: string } }>("/auth/me", { method: "GET" }, { token });
  }
};
