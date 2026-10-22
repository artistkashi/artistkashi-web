import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { client } from "@/api/openapi-client/client.gen";
import { getDeviceId } from "@/lib/device-id";
import { getItem, removeItem, setItem, STORAGE_KEYS } from "@/lib/storage";

client.setConfig({
  throwOnError: true,
});

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
client.setConfig({ baseURL: new URL(API_BASE).origin });

client.instance.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["X-Device-Id"] = getDeviceId();
  }
  return config;
});

export const setAuthToken = (token?: string | null) => {
  if (token) {
    client.setConfig({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
};

function clearAuthStorage() {
  removeItem(STORAGE_KEYS.AUTH_TOKEN);
  removeItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
  removeItem(STORAGE_KEYS.AUTH_USER);
}

let isRefreshing = false;
let pendingRequests: Array<{
  config: InternalAxiosRequestConfig;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

async function refreshAccessToken(): Promise<string> {
  const refreshTokenValue = getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
  if (!refreshTokenValue) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(`${new URL(API_BASE).origin}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": getDeviceId(),
    },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const result = await response.json();
  const accessToken: string | undefined = result?.data?.access_token;
  const newRefreshToken: string | undefined = result?.data?.refresh_token;

  if (!accessToken) {
    throw new Error("No access token in refresh response");
  }

  setItem(STORAGE_KEYS.AUTH_TOKEN, accessToken);
  if (newRefreshToken) {
    setItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN, newRefreshToken);
  }

  return accessToken;
}

client.instance.interceptors.response.use(
  undefined,
  async (error: AxiosError) => {
    const originalConfig = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const isAuth = originalConfig?.url?.includes("/auth/") ?? false;

    if (
      error?.response?.status === 401 &&
      !isAuth &&
      originalConfig &&
      !originalConfig._retry &&
      typeof window !== "undefined"
    ) {
      originalConfig._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            config: originalConfig,
            resolve,
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();

        const pending = [...pendingRequests];
        pendingRequests = [];

        for (const { config, resolve } of pending) {
          config.headers.Authorization = `Bearer ${newToken}`;
          resolve(client.instance(config));
        }

        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return client.instance(originalConfig);
      } catch {
        const pending = [...pendingRequests];
        pendingRequests = [];

        for (const { reject } of pending) {
          reject(error);
        }

        const refreshTokenValue = getItem(STORAGE_KEYS.AUTH_REFRESH_TOKEN);
        if (refreshTokenValue) {
          try {
            await fetch(`${new URL(API_BASE).origin}/api/auth/logout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Device-Id": getDeviceId(),
              },
              body: JSON.stringify({ refresh_token: refreshTokenValue }),
            });
          } catch {
            // best-effort
          }
        }

        clearAuthStorage();
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));

        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    const backendMessage = (
      error?.response?.data as Record<string, unknown> | undefined
    )?.message;
    if (backendMessage && typeof backendMessage === "string") {
      error.message = backendMessage;
    }
    return Promise.reject(error);
  }
);
