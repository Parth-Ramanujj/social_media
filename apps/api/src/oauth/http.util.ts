export interface HttpResult {
  status: number;
  json: any;
  headers: Headers;
}

/** Default request timeout — a hung provider call must never block the worker forever. */
export const HTTP_TIMEOUT_MS = 45_000;

/** Thin fetch wrapper for provider HTTP calls (Node 24 global fetch). */
export async function httpJson(url: string, init?: RequestInit): Promise<HttpResult> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
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
  readonly errorClass: ProviderErrorClass;
  readonly retryable: boolean;
  /** Human-friendly message safe to show end users. */
  readonly userMessage: string;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly providerResponse?: unknown,
  ) {
    super(message);
    const classified = classifyProviderError({ status: status ?? 0, json: providerResponse });
    this.errorClass = classified.errorClass;
    this.retryable = classified.retryable;
    this.userMessage = classified.userMessage;
  }
}

/** Thrown by publish() when a provider reports a rate limit with a known reset time. */
export class RateLimitedError extends Error {
  constructor(public readonly resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`);
  }
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Issue a provider HTTP call with retry/backoff.
 * Retries ONLY retryable failure classes (rate_limited/temporary/unknown);
 * auth/permission/invalid-request errors never retry. Never infinite: max 3 attempts.
 */
export async function httpJsonWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { requestId?: string },
): Promise<HttpResult> {
  let last: HttpResult | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    last = await httpJson(url, init);
    if (last.status >= 200 && last.status < 300) {
      return last;
    }
    const classified = classifyProviderError(last);
    if (!classified.retryable || attempt === MAX_RETRIES) {
      return last;
    }
    // Respect a provider-declared reset when present (x-app-usage / Retry-After).
    const retryAfter = last.headers.get('retry-after');
    const delayMs = retryAfter
      ? Math.min(Number(retryAfter) * 1000, 30_000)
      : RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    if (opts?.requestId) {
      console.log(
        JSON.stringify({
          level: 'warn',
          requestId: opts.requestId,
          event: 'provider_retry',
          attempt,
          status: last.status,
          errorClass: classified.errorClass,
          retryAfterMs: delayMs,
        }),
      );
    }
    await sleep(delayMs);
  }
  return last!;
}

/**
 * Error taxonomy shared by all platform clients.
 *
 * Classification rules (verified against Meta Graph API error codes, v26.0,
 * and the WhatsApp Business Platform error catalog):
 *  - token_expired:      Graph code 190; WhatsApp 131030 (auth) — never retry.
 *  - permission_missing: Graph code 200 / 100 with insufficient-permission
 *                        subcodes; WhatsApp 131042/131053 — never retry.
 *  - rate_limited:       Graph codes 4, 17, 32, 613 + x-app-usage; WhatsApp
 *                        131026 — retryable with backoff (respect reset time).
 *  - invalid_request:    Graph 100 subcodes (bad param, message-empty, etc.);
 *                        WhatsApp 131xxx param/media/template errors — never retry.
 *  - temporary:          5xx, network/timeout, WhatsApp 131048 (temporarily
 *                        unavailable) — retryable with backoff.
 *  - unknown:            anything else — retryable once as a safety net.
 */
export type ProviderErrorClass =
  | 'token_expired'
  | 'permission_missing'
  | 'rate_limited'
  | 'invalid_request'
  | 'temporary'
  | 'unknown';

export interface ClassifiedError {
  errorClass: ProviderErrorClass;
  retryable: boolean;
  /** Stable human-friendly message for end users (never raw stack traces). */
  userMessage: string;
}

const GRAPH_TOKEN_EXPIRED_CODES = new Set([190]);
const GRAPH_PERMISSION_CODES = new Set([10, 200, 277]);
const GRAPH_RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const GRAPH_INVALID_REQUEST_CODES = new Set([100, 2, 2500, 3501]);
const WA_TOKEN_CODES = new Set([131030, 131031]);
const WA_PERMISSION_CODES = new Set([131042, 131053, 131056]);
const WA_RATE_LIMIT_CODES = new Set([131026]);
const WA_INVALID_CODES = new Set([131009, 131020, 131021, 131022, 131026, 131046, 131047]);
const WA_TEMPORARY_CODES = new Set([131048, 131060]);

function graphCode(json: any): number | undefined {
  return typeof json?.error?.code === 'number' ? json.error.code : undefined;
}

function whatsappCode(json: any): number | undefined {
  const code = json?.error?.code;
  if (typeof code === 'number') return code;
  const sub = json?.error?.error_subcode;
  return typeof sub === 'number' ? sub : undefined;
}

function userMessageFor(errorClass: ProviderErrorClass, res: { status: number; json: any }): string {
  const err = res.json?.error ?? {};
  const detail = err.error_user_msg ?? err.message ?? JSON.stringify(res.json ?? {}).slice(0, 200);
  switch (errorClass) {
    case 'token_expired':
      return 'Your connection has expired. Please reconnect the account.';
    case 'permission_missing':
      return 'The platform is missing a required permission. Reconnect the account to re-authorize.';
    case 'rate_limited':
      return 'The platform rate limit was reached. Please wait a moment and try again.';
    case 'invalid_request':
      return `The platform rejected the request: ${detail}`;
    case 'temporary':
      return 'The platform is temporarily unavailable. Please try again shortly.';
    default:
      return `The platform returned an error (HTTP ${res.status}): ${detail}`;
  }
}

/** Classify a provider HTTP response into an error class + retry policy. */
export function classifyProviderError(res: { status: number; json: any }): ClassifiedError {
  const status = res.status;
  const metaCode = graphCode(res.json);
  const waCode = whatsappCode(res.json);

  if (metaCode !== undefined) {
    if (GRAPH_TOKEN_EXPIRED_CODES.has(metaCode)) {
      return { errorClass: 'token_expired', retryable: false, userMessage: userMessageFor('token_expired', res) };
    }
    if (GRAPH_PERMISSION_CODES.has(metaCode)) {
      return { errorClass: 'permission_missing', retryable: false, userMessage: userMessageFor('permission_missing', res) };
    }
    if (GRAPH_RATE_LIMIT_CODES.has(metaCode) || status === 429) {
      return { errorClass: 'rate_limited', retryable: true, userMessage: userMessageFor('rate_limited', res) };
    }
    if (GRAPH_INVALID_REQUEST_CODES.has(metaCode)) {
      return { errorClass: 'invalid_request', retryable: false, userMessage: userMessageFor('invalid_request', res) };
    }
  }
  if (waCode !== undefined) {
    if (WA_TOKEN_CODES.has(waCode)) {
      return { errorClass: 'token_expired', retryable: false, userMessage: userMessageFor('token_expired', res) };
    }
    if (WA_PERMISSION_CODES.has(waCode)) {
      return { errorClass: 'permission_missing', retryable: false, userMessage: userMessageFor('permission_missing', res) };
    }
    if (WA_RATE_LIMIT_CODES.has(waCode) || status === 429) {
      return { errorClass: 'rate_limited', retryable: true, userMessage: userMessageFor('rate_limited', res) };
    }
    if (WA_INVALID_CODES.has(waCode)) {
      return { errorClass: 'invalid_request', retryable: false, userMessage: userMessageFor('invalid_request', res) };
    }
    if (WA_TEMPORARY_CODES.has(waCode)) {
      return { errorClass: 'temporary', retryable: true, userMessage: userMessageFor('temporary', res) };
    }
  }
  if (status >= 500 || status === 408 || status === 0) {
    return { errorClass: 'temporary', retryable: true, userMessage: userMessageFor('temporary', res) };
  }
  if (status === 429) {
    return { errorClass: 'rate_limited', retryable: true, userMessage: userMessageFor('rate_limited', res) };
  }
  return { errorClass: 'unknown', retryable: true, userMessage: userMessageFor('unknown', res) };
}