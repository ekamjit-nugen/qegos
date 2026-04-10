import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  clearTokens,
} from './tokenStorage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ─── CSRF Token ────────────────────────────────────────────────────────────
// The API enforces CSRF on every state-changing request. Fetch a token lazily
// on the first mutation, cache it in memory, and attach it as X-CSRF-Token.

let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;

async function fetchCsrfToken(): Promise<string | null> {
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = axios
    .get<{ status: number; data: { csrfToken?: string; csrfEnabled?: boolean } }>(
      `${API_URL}/csrf-token`,
      { withCredentials: true },
    )
    .then((res) => {
      csrfToken = res.data.data.csrfToken ?? null;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfFetchPromise = null;
    });
  return csrfFetchPromise;
}

function isMutatingMethod(method: string | undefined): boolean {
  if (!method) return false;
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

// ─── Request Interceptor ───────────────────────────────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (isMutatingMethod(config.method)) {
    if (!csrfToken) {
      await fetchCsrfToken();
    }
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// ─── Response Interceptor (401 → silent refresh) ──────────────────────────

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  for (const { resolve, reject } of refreshQueue) {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  }
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _csrfRetry?: boolean;
    };

    // Retry once on CSRF_INVALID: cached token went stale, refetch and replay
    const errData = error.response?.data as { code?: string } | undefined;
    if (
      error.response?.status === 403 &&
      errData?.code === 'CSRF_INVALID' &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      csrfToken = null;
      const fresh = await fetchCsrfToken();
      if (fresh) {
        originalRequest.headers['X-CSRF-Token'] = fresh;
        return api(originalRequest);
      }
    }

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Skip refresh for auth endpoints to avoid loops
    if (originalRequest.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token');
      }

      const response = await axios.post(`${API_URL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data.data;
      setAccessToken(accessToken);
      setRefreshToken(newRefreshToken);
      processQueue(null, accessToken);

      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
