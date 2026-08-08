import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Platform } from '@pulse/shared-types';
import {
  InboxItem,
  ProviderAuthResult,
  ProviderMetrics,
  SocialAccountRef,
  WebhookRequest,
} from '../../social-provider.interface';
import { formBody, httpJson, ProviderError } from '../../http.util';
import { BaseProvider } from '../base.provider';
import { ProviderRegistry } from '../../provider-registry.service';

/**
 * Pinterest API v5 — EXPERIMENTAL. Pin creation via image URL.
 * Docs: https://developers.pinterest.com/docs/api/v5/
 */
@Injectable()
export class PinterestProvider extends BaseProvider {
  readonly platform: Platform = 'pinterest';

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
  }

  private get clientId(): string {
    return this.config.get<string>('PINTEREST_CLIENT_ID') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('PINTEREST_CLIENT_SECRET') ?? '';
  }

  get enabled(): boolean {
    return (
      this.config.get<boolean>('platformEnabled.pinterest') === true && !!this.clientId && !!this.clientSecret
    );
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/pinterest`,
      response_type: 'code',
      scope: 'boards:read boards:write pins:read pins:write',
      state: opts.state,
    });
    return `https://www.pinterest.com/oauth/?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string }): Promise<ProviderAuthResult> {
    const res = await httpJson('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code: opts.code,
        redirect_uri: `${opts.appUrl}/api/oauth/callback/pinterest`,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('Pinterest token exchange failed', res.status, res.json);
    }
    const me = await httpJson('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${res.json.access_token}` },
    });
    if (me.status !== 200) {
      throw new ProviderError('Pinterest user_account failed', me.status, me.json);
    }
    return {
      externalAccountId: String(me.json.username ?? me.json.id),
      displayName: me.json.username ?? 'Pinterest user',
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? null,
      expiresIn: Number(res.json.expires_in ?? null),
      metadata: { username: me.json.username ?? null },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    if (!account.refreshToken) {
      throw new ProviderError('Pinterest account has no refresh token');
    }
    const res = await httpJson('https://api.pinterest.com/v5/oauth/token', {
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
      throw new ProviderError('Pinterest token refresh failed', res.status, res.json);
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
    _opts: { providerIdempotencyKey: string },
  ) {
    if (!content.mediaUrls[0]) {
      throw new ProviderError('Pinterest pins require an image URL');
    }
    const boards = await httpJson('https://api.pinterest.com/v5/boards?page_size=25', {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (boards.status !== 200) {
      throw new ProviderError('Pinterest boards failed', boards.status, boards.json);
    }
    const boardId = boards.json.items?.[0]?.id;
    if (!boardId) {
      throw new ProviderError('No Pinterest board found — create one first');
    }
    const res = await httpJson('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        title: content.text.split('\n')[0].slice(0, 100),
        description: content.text,
        media_source: { source_type: 'image_url', url: content.mediaUrls[0] },
      }),
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new ProviderError('Pinterest pin failed', res.status, res.json);
    }
    return {
      platformPostId: String(res.json.id),
      permalink: res.json.link ?? undefined,
    };
  }

  protected async doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    const res = await httpJson(
      `https://api.pinterest.com/v5/pins/${platformPostId}/analytics?metric_types=IMPRESSION,SAVE_PIN,CLICK,LINK_CLICK`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    if (res.status !== 200) {
      throw new ProviderError('Pinterest analytics failed', res.status, res.json);
    }
    const total = (k: string) => Number(res.json.summary_metrics?.[k] ?? 0);
    return {
      impressions: total('IMPRESSION'),
      reach: 0,
      likes: total('SAVE_PIN'),
      comments: 0,
      shares: total('LINK_CLICK'),
      videoViews: 0,
    };
  }

  protected async doFetchInbox(_account: SocialAccountRef, _since: string): Promise<InboxItem[]> {
    return []; // Pinterest has no unified comments API
  }

  protected async doReply(_account: SocialAccountRef, _externalMessageId: string, _text: string): Promise<void> {
    throw new ProviderError('Pinterest replies are not supported');
  }

  protected async doVerifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return false;
  }
}
