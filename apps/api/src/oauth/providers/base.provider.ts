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

  protected abstract doReply(account: SocialAccountRef, externalMessageId: string, text: string): Promise<void>;

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
    return this.doExchangeCode(opts);
  }

  async refreshToken(
    account: SocialAccountRef,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }> {
    if (!this.enabled) {
      return { accessToken: 'dry-run-token', refreshToken: null, expiresIn: null };
    }
    return this.doRefreshToken(account);
  }

  async publish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ): Promise<{ result: { platformPostId: string; permalink?: string }; rateLimit?: RateLimitInfo }> {
    if (!this.enabled) {
      return { result: { platformPostId: this.dryRunId() } };
    }
    const { rateLimit, ...result } = await this.doPublish(account, content, opts);
    return { result, rateLimit: rateLimit ?? undefined };
  }

  async fetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    if (!this.enabled || platformPostId.startsWith('dry-run:')) {
      return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 };
    }
    return this.doFetchPostMetrics(account, platformPostId);
  }

  async fetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]> {
    if (!this.enabled) {
      return [];
    }
    return this.doFetchInbox(account, since);
  }

  async reply(account: SocialAccountRef, externalMessageId: string, text: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    return this.doReply(account, externalMessageId, text);
  }

  verifyWebhook(req: WebhookRequest): Promise<boolean> {
    if (!this.enabled) {
      return Promise.resolve(false);
    }
    return this.doVerifyWebhook(req);
  }

  parseRateLimit(headers: Record<string, string | string[] | undefined>): RateLimitInfo | null {
    return null;
  }

  protected firstHeader(headers: Headers, name: string): string | null {
    const v = headers.get(name);
    return v ? String(v) : null;
  }
}