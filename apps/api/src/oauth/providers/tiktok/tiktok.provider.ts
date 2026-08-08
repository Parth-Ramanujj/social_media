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
 * TikTok Content Posting API — EXPERIMENTAL. Direct video upload flow.
 * Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 */
@Injectable()
export class TikTokProvider extends BaseProvider {
  readonly platform: Platform = 'tiktok';

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
  }

  private get clientKey(): string {
    return this.config.get<string>('TIKTOK_CLIENT_KEY') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('TIKTOK_CLIENT_SECRET') ?? '';
  }

  get enabled(): boolean {
    return (
      this.config.get<boolean>('platformEnabled.tiktok') === true && !!this.clientKey && !!this.clientSecret
    );
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/tiktok`,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      state: opts.state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string }): Promise<ProviderAuthResult> {
    const res = await httpJson('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: opts.code,
        grant_type: 'authorization_code',
        redirect_uri: `${opts.appUrl}/api/oauth/callback/tiktok`,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('TikTok token exchange failed', res.status, res.json);
    }
    const me = await httpJson('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
      headers: { Authorization: `Bearer ${res.json.access_token}` },
    });
    if (me.status !== 200) {
      throw new ProviderError('TikTok user info failed', me.status, me.json);
    }
    const user = me.json.data?.user;
    return {
      externalAccountId: String(user?.open_id),
      displayName: user?.display_name ?? 'TikTok user',
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? null,
      expiresIn: Number(res.json.expires_in ?? null),
      metadata: { openId: String(user?.open_id) },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    if (!account.refreshToken) {
      throw new ProviderError('TikTok account has no refresh token');
    }
    const res = await httpJson('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('TikTok token refresh failed', res.status, res.json);
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
    const mediaUrl = content.mediaUrls[0];
    if (!mediaUrl) {
      throw new ProviderError('TikTok posts require a video media URL');
    }
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      throw new ProviderError(`Failed to fetch media from ${mediaUrl} (status ${mediaRes.status})`);
    }
    const bytes = Buffer.from(await mediaRes.arrayBuffer());
    const contentType = mediaRes.headers.get('content-type') ?? 'video/mp4';

    const init = await httpJson('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: content.text, privacy_level: 'PRIVATE_TO_USER', disable_duet: true, disable_comment: true, disable_stitch: true },
        source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: 5 * 1024 * 1024, total_chunk_count: Math.max(1, Math.ceil(bytes.length / (5 * 1024 * 1024))) },
      }),
    });
    if (init.status !== 200) {
      throw new ProviderError('TikTok video init failed', init.status, init.json);
    }
    const uploadUrl = init.json?.data?.upload_url;
    if (!uploadUrl) {
      throw new ProviderError('TikTok init returned no upload_url');
    }
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length) },
      body: new Uint8Array(bytes),
    });
    if (upload.status !== 200) {
      throw new ProviderError('TikTok upload failed', upload.status, await upload.text());
    }
    const publish = await httpJson('https://open.tiktokapis.com/v2/post/publish/video/status/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: init.json.data.publish_id }),
    });
    if (publish.status !== 200) {
      throw new ProviderError('TikTok publish status failed', publish.status, publish.json);
    }
    return {
      platformPostId: String(init.json.data.publish_id),
      permalink: undefined,
    };
  }

  protected async doFetchPostMetrics(_account: SocialAccountRef, _platformPostId: string): Promise<ProviderMetrics> {
    return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 }; // Research API only
  }

  protected async doFetchInbox(_account: SocialAccountRef, _since: string): Promise<InboxItem[]> {
    return [];
  }

  protected async doReply(_account: SocialAccountRef, _externalMessageId: string, _text: string): Promise<void> {
    throw new ProviderError('TikTok replies are not supported');
  }

  protected async doVerifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return false;
  }
}
