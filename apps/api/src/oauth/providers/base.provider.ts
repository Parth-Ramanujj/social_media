import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Platform } from '@pulse/shared-types';
import {
  InboxItem,
  ProviderAuthResult,
  ProviderMetrics,
  RateLimitInfo,
  SocialAccountRef,
  SocialProvider,
  WebhookRequest,
} from '../social-provider.interface';
import { ProviderError, RateLimitedError } from '../http.util';

/**
 * Shared plumbing for platform providers.
 *
 * DRY-RUN MODE: when the platform's app credentials are missing from .env
 * (or <PLATFORM>_ENABLED=false), the provider still registers and every
 * operation returns a synthetic result prefixed `dry-run:`. This keeps the
 * full product pipeline (connect -> schedule -> queue -> publish -> analytics)
 * testable before any developer-app approval. `isConfigured()` is the flag.
 */
export abstract class BaseProvider implements SocialProvider {
  abstract readonly platform: Platform;

  protected constructor(protected readonly config: ConfigService) {}

  abstract getAuthorizationUrl(opts: { state: string; appUrl: string }): string;

  protected abstract doExchangeCode(opts: { code: string; appUrl: string; state: string }): Promise<ProviderAuthResult>;

  protected abstract doRefreshToken(
    account: SocialAccountRef,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }>;

  protected abstract doPublish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ): Promise<{ platformPostId: string; permalink?: string; rateLimit?: RateLimitInfo | null }>;

  protected abstract doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics>;

  protected abstract doFetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]>;

  protected abstract doReply(
    account: SocialAccountRef,
    externalMessageId: string,
    text: string,
    context?: { metadata?: Record<string, unknown> },
  ): Promise<void>;

  // Most platforms have no (practical) webhooks; override to implement signature checks.
  protected abstract doVerifyWebhook(req: WebhookRequest): Promise<boolean>;

  /** Implementations return their credential presence check. */
  abstract get enabled(): boolean;

  protected dryRunId(): string {
    return `dry-run:${this.platform}:${randomBytes(6).toString('hex')}`;
  }

  protected dryAccount(account: SocialAccountRef) {
    return {
      accessToken: 'dry-run-token',
      refreshToken: null,
      tokenExpiresAt: null,
      metadata: { dryRun: true },
    };
  }

  /**
   * Structured trace around every provider operation: internal request id,
   * workspace, platform, action, latency, outcome. Never logs tokens.
   * Emits one JSON line per call so logs stay greppable by request id.
   */
  private async traced<T>(
    action: string,
    account: SocialAccountRef | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    const requestId = randomBytes(8).toString('hex');
    const startedAt = Date.now();
    const base = {
      level: 'info',
      requestId,
      workspaceId: account?.workspaceId ?? null,
      platform: this.platform,
      action,
    };
    try {
      const result = await fn();
      console.log(
        JSON.stringify({
          ...base,
          event: 'provider_ok',
          durationMs: Date.now() - startedAt,
        }),
      );
      return result;
    } catch (e) {
      const errorClass =
        e instanceof ProviderError
          ? e.errorClass
          : e instanceof RateLimitedError
            ? 'rate_limited'
            : 'unknown';
      console.log(
        JSON.stringify({
          ...base,
          event: 'provider_error',
          durationMs: Date.now() - startedAt,
          errorClass,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      throw e;
    }
  }

  async exchangeCode(opts: { code: string; appUrl: string; state: string }): Promise<ProviderAuthResult> {
    if (!this.enabled) {
      return {
        externalAccountId: this.dryRunId(),
        displayName: `Dry-run ${this.platform} account`,
        accessToken: 'dry-run-token',
        refreshToken: null,
        expiresIn: null,
        metadata: { dryRun: true },
      };
    }
    return this.traced('exchangeCode', null, () => this.doExchangeCode(opts));
  }

  async refreshToken(
    account: SocialAccountRef,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }> {
    if (!this.enabled) {
      return { accessToken: 'dry-run-token', refreshToken: null, expiresIn: null };
    }
    return this.traced('refreshToken', account, () => this.doRefreshToken(account));
  }

  async publish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ): Promise<{ result: { platformPostId: string; permalink?: string }; rateLimit?: RateLimitInfo }> {
    if (!this.enabled) {
      return { result: { platformPostId: this.dryRunId() } };
    }
    return this.traced('publish', account, async () => {
      const { rateLimit, ...result } = await this.doPublish(account, content, opts);
      return { result, rateLimit: rateLimit ?? undefined };
    });
  }

  async fetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    if (!this.enabled || platformPostId.startsWith('dry-run:')) {
      return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 };
    }
    return this.traced('fetchPostMetrics', account, () => this.doFetchPostMetrics(account, platformPostId));
  }

  async fetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]> {
    if (!this.enabled) {
      return [];
    }
    return this.traced('fetchInbox', account, () => this.doFetchInbox(account, since));
  }

  async reply(
    account: SocialAccountRef,
    externalMessageId: string,
    text: string,
    context?: { metadata?: Record<string, unknown> },
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }
    return this.traced('reply', account, () => this.doReply(account, externalMessageId, text, context));
  }

  verifyWebhook(req: WebhookRequest): Promise<boolean> {
    if (!this.enabled) {
      return Promise.resolve(false);
    }
    return this.traced('verifyWebhook', null, () => this.doVerifyWebhook(req));
  }

  parseRateLimit(headers: Record<string, string | string[] | undefined>): RateLimitInfo | null {
    return null;
  }

  protected firstHeader(headers: Headers, name: string): string | null {
    const v = headers.get(name);
    return v ? String(v) : null;
  }
}