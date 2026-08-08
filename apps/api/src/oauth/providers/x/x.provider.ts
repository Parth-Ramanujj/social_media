import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Platform } from '@pulse/shared-types';
import {
  InboxItem,
  ProviderAuthResult,
  ProviderMetrics,
  RateLimitInfo,
  SocialAccountRef,
  WebhookRequest,
} from '../../social-provider.interface';
import { formBody, httpJson, ProviderError } from '../../http.util';
import { BaseProvider } from '../base.provider';
import { ProviderRegistry } from '../../provider-registry.service';

/**
 * X API v2 — OAuth 2.0 with PKCE, `tweet.write` scope.
 * Docs: https://developer.x.com/en/docs/x-api
 */
@Injectable()
export class XProvider extends BaseProvider {
  readonly platform: Platform = 'x';

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
  }

  private get clientId(): string {
    return this.config.get<string>('X_CLIENT_ID') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('X_CLIENT_SECRET') ?? '';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('platformEnabled.x') === true && !!this.clientId && !!this.clientSecret;
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    // PKCE: verifier stored in the state JWT by the OauthService, challenge here.
    const codeChallenge = createHash('sha256').update(opts.state).digest('base64url');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/x`,
      scope: 'tweet.read tweet.write users.read offline.access',
      state: opts.state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://twitter.com/i/oauth2/authorize?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string; state: string }): Promise<ProviderAuthResult> {
    const res = await httpJson('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code: opts.code,
        redirect_uri: `${opts.appUrl}/api/oauth/callback/x`,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code_verifier: opts.state,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('X token exchange failed', res.status, res.json);
    }
    const me = await httpJson('https://api.twitter.com/2/users/me?user.fields=name,username', {
      headers: { Authorization: `Bearer ${res.json.access_token}` },
    });
    if (me.status !== 200) {
      throw new ProviderError('X /users/me failed', me.status, me.json);
    }
    const data = me.json.data;
    return {
      externalAccountId: String(data.id),
      displayName: `@${data.username} (${data.name})`,
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? null,
      expiresIn: Number(res.json.expires_in ?? null),
      metadata: { userId: String(data.id), username: data.username },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    if (!account.refreshToken) {
      throw new ProviderError('X account has no refresh token');
    }
    const res = await httpJson('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('X token refresh failed', res.status, res.json);
    }
    return {
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? account.refreshToken,
      expiresIn: Number(res.json.expires_in ?? null),
    };
  }

  protected async doPublish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ) {
    // X v2 media upload (chunked) is not wired yet; media urls are ignored.
    const res = await httpJson('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': opts.providerIdempotencyKey, // server-side dedupe on retries
      },
      body: JSON.stringify({ text: content.text }),
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new ProviderError('X tweet failed', res.status, res.json);
    }
    return {
      platformPostId: String(res.json.data?.id),
      permalink: `https://x.com/i/status/${res.json.data?.id}`,
      rateLimit: this.parseRateLimit(this.headersOf(res)),
    };
  }

  protected async doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    const res = await httpJson(
      `https://api.twitter.com/2/tweets/${platformPostId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    if (res.status !== 200) {
      throw new ProviderError('X metrics failed', res.status, res.json);
    }
    const m = res.json.data?.public_metrics ?? {};
    const impressions = Number(m.impression_count ?? 0);
    return {
      impressions,
      reach: impressions,
      likes: Number(m.like_count ?? 0),
      comments: Number(m.reply_count ?? 0),
      shares: Number(m.retweet_count ?? 0) + Number(m.quote_count ?? 0),
      videoViews: 0,
    };
  }

  protected async doFetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]> {
    const userId = account.externalAccountId;
    const res = await httpJson(
      `https://api.twitter.com/2/users/${userId}/mentions?tweet.fields=author_id,text,created_at&start_time=${encodeURIComponent(since)}&max_results=50`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    if (res.status !== 200) {
      throw new ProviderError('X mentions failed', res.status, res.json);
    }
    return (res.json.data ?? []).map((t: any) => ({
      externalMessageId: String(t.id),
      type: 'comment',
      senderName: t.author_id ?? 'Unknown',
      content: t.text ?? '',
      createdAt: new Date(t.created_at),
      raw: { authorId: t.author_id },
    }));
  }

  protected async doReply(account: SocialAccountRef, externalMessageId: string, text: string): Promise<void> {
    const res = await httpJson('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: externalMessageId } }),
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new ProviderError('X reply failed', res.status, res.json);
    }
  }

  protected async doVerifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return false; // polling used for X
  }

  parseRateLimit(headers: Record<string, string | string[] | undefined>): RateLimitInfo | null {
    const remaining = headers['x-rate-limit-remaining'];
    const reset = headers['x-rate-limit-reset'];
    if (!reset || Array.isArray(reset)) {
      return null;
    }
    return {
      remaining: remaining && !Array.isArray(remaining) ? Number(remaining) : undefined,
      resetAt: new Date(Number(reset) * 1000).toISOString(),
    };
  }

  private headersOf(res: { headers: Headers }): Record<string, string | string[] | undefined> {
    const out: Record<string, string | string[] | undefined> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    return out;
  }
}
