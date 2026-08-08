export interface HttpResult {
  status: number;
  json: any;
  headers: Headers;
}

/** Thin fetch wrapper for provider HTTP calls (Node 24 global fetch). */
export async function httpJson(url: string, init?: RequestInit): Promise<HttpResult> {
  const res = await fetch(url, init);
  let json: any = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: res.status, json, headers: res.headers };
}

export function formBody(data: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    params.set(k, v);
  }
  return params;
}

export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly providerResponse?: unknown,
  ) {
    super(message);
  }
}

/** Thrown by publish() when a provider reports a rate limit with a known reset time. */
export class RateLimitedError extends Error {
  constructor(public readonly resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`);
  }
}