import type { Platform } from '@pulse/shared-types';

/**
 * Everything a social platform must implement to be usable by the platform.
 * New networks = new class behind this interface + registration in OauthModule.
 * Only official platform APIs are allowed — no scraping, no unofficial endpoints.
 */

export interface SocialAccountRef {
  id: string;
  workspaceId: string;
  platform: Platform;
  externalAccountId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface ProviderAuthResult {
  externalAccountId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  metadata: Record<string, unknown>;
}

export interface ProviderPublishResult {
  platformPostId: string;
  /** Any URL/permalink to the published post for the UI. */
  permalink?: string;
}

export interface ProviderMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  videoViews: number;
}

export interface InboxItem {
  externalMessageId: string;
  type: 'comment' | 'dm';
  senderName: string;
  content: string;
  createdAt: Date;
  /** Additional provider-specific payload, e.g. parent comment id. */
  raw: Record<string, unknown>;
}

export interface RateLimitInfo {
  /** RFC-7231 date string when the limit resets. */
  resetAt?: string;
  remaining?: number;
}

export interface SocialProvider {
  readonly platform: Platform;
  /** False when no app credentials are configured (see <PLATFORM>_ENABLED in .env). */
  readonly enabled: boolean;

  /** Step 1 of OAuth 2.0: build the provider consent URL. */
  getAuthorizationUrl(opts: { state: string; appUrl: string }): string;

  /** Step 2: exchange the callback `code` for tokens + account identity. */
  exchangeCode(opts: { code: string; appUrl: string; state: string }): Promise<ProviderAuthResult>;

  /** Refresh an expiring token. Throws to flag the account needs_reconnect. */
  refreshToken(account: SocialAccountRef): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }>;

  /**
   * Publish content. Must be IDEMPOTENT at the provider level:
   * pass `providerIdempotencyKey` and set the provider's dedupe/unique id
   * if supported (e.g. X's idempotency key, Meta's upsert param), so retries
   * never produce duplicates.
   */
  publish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ): Promise<{ result: ProviderPublishResult; rateLimit?: RateLimitInfo }>;

  /** Per-post insights. `metricDate` aggregation happens in the caller. */
  fetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics>;

  /** Comments/DMs since `since` (ISO). Used by the inbox polling worker. */
  fetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]>;

  /** Reply to a comment/DM from the unified inbox. */
  reply(account: SocialAccountRef, externalMessageId: string, text: string): Promise<void>;

  /**
   * Webhook signature verification. Return false for providers without
   * webhooks (poller is used instead). Implementations read the provider's
   * raw request headers/body via the WebhookRequest.
   */
  verifyWebhook(req: WebhookRequest): Promise<boolean>;

  /** Used to store rate-limit counters on the SocialAccount row after calls. */
  parseRateLimit(headers: Record<string, string | string[] | undefined>): RateLimitInfo | null;
}

export interface WebhookRequest {
  platform: Platform;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  query: Record<string, string>;
}