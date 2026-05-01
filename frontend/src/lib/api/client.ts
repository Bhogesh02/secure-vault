export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};

export type RequestOptions = {
  token?: string;
  folderPassword?: string;
};

export async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as ApiResponse<T>)
    : ({ success: response.ok, data: null as T, message: await response.text() } satisfies ApiResponse<T>);

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.folderPassword) {
    headers.set("x-folder-password", options.folderPassword);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  // Handle Token Refresh for 401 errors
  if (response.status === 401 && !path.includes("/auth/refresh") && !path.includes("/auth/login")) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include"
        });
        
        if (refreshRes.ok) {
          isRefreshing = false;
          onRefreshed("refreshed"); // We don't actually need the token value since it's in a cookie
          return apiRequest<T>(path, init, options); // Retry
        }
      } catch (e) {
        // Fall through to error
      } finally {
        isRefreshing = false;
      }
    } else {
      // Wait for the ongoing refresh to complete
      return new Promise((resolve) => {
        subscribeTokenRefresh(() => {
          resolve(apiRequest<T>(path, init, options));
        });
      });
    }
  }

  return parseApiResponse<T>(response);
}
