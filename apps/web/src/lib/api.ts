/**
 * API client: Bearer access token + single-flight refresh via the
 * httpOnly `pulse_refresh` cookie (credentials: 'include').
 */

export const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const TOKEN_KEY = 'pulse.access_token';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

export function bootstrapToken() {
  if (typeof window === 'undefined') return;
  accessToken = localStorage.getItem(TOKEN_KEY);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken?: string };
        if (!data.accessToken) return null;
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
    this.name = 'ApiError';
  }

  messageOf(): string {
    const b = this.body as { message?: string | string[] } | null;
    if (b?.message) return Array.isArray(b.message) ? b.message.join(', ') : b.message;
    return `Request failed (${this.status})`;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  /** true for public routes: never attempt a refresh cycle. */
  public?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const run = (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
  };

  let res = await run(getAccessToken());

  if (res.status === 401 && !opts.public) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await run(fresh);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });
export const patch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
