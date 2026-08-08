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

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const READ_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

/**
 * YouTube Data API v3 — video upload (resumable) + stats.
 * Docs: https://developers.google.com/youtube/v3
 */
@Injectable()
export class YouTubeProvider extends BaseProvider {
  readonly platform: Platform = 'youtube';

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
  }

  private get clientId(): string {
    return this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('platformEnabled.youtube') === true && !!this.clientId && !!this.clientSecret;
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/youtube`,
      response_type: 'code',
      scope: `${UPLOAD_SCOPE} ${READ_SCOPE}`,
      access_type: 'offline', // required for refresh tokens
      prompt: 'consent',
      state: opts.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string }): Promise<ProviderAuthResult> {
    const res = await httpJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code: opts.code,
        redirect_uri: `${opts.appUrl}/api/oauth/callback/youtube`,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('Google token exchange failed', res.status, res.json);
    }
    const channels = await httpJson(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${res.json.access_token}` } },
    );
    if (channels.status !== 200) {
      throw new ProviderError('YouTube channels failed', channels.status, channels.json);
    }
    const channel = channels.json.items?.[0];
    if (!channel) {
      throw new ProviderError('No YouTube channel found for this Google account');
    }
    return {
      externalAccountId: String(channel.id),
      displayName: channel.snippet?.title ?? 'YouTube channel',
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? null,
      expiresIn: Number(res.json.expires_in ?? null),
      metadata: { channelId: String(channel.id) },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    if (!account.refreshToken) {
      throw new ProviderError('YouTube account has no refresh token');
    }
    const res = await httpJson('https://oauth2.googleapis.com/token', {
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
      throw new ProviderError('Google token refresh failed', res.status, res.json);
    }
    return {
      accessToken: res.json.access_token,
      refreshToken: account.refreshToken,
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
      throw new ProviderError('YouTube posts require a video media URL');
    }
    // 1. Download the media bytes (S3/MinIO URL in dev).
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      throw new ProviderError(`Failed to fetch media from ${mediaUrl} (status ${mediaRes.status})`);
    }
    const bytes = Buffer.from(await mediaRes.arrayBuffer());
    const contentType = mediaRes.headers.get('content-type') ?? 'video/mp4';

    const title = content.text.split('\n')[0].slice(0, 100) || 'Pulse video';
    // 2. Initiate the resumable upload.
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify({
        snippet: { title, description: content.text },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
    });
    if (init.status !== 200) {
      throw new ProviderError('YouTube upload init failed', init.status, await init.text());
    }
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) {
      throw new ProviderError('YouTube upload init returned no Location header');
    }
    // 3. Upload the bytes.
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: new Uint8Array(bytes),
    });
    if (upload.status !== 200 && upload.status !== 201) {
      throw new ProviderError('YouTube media upload failed', upload.status, await upload.text());
    }
    const video = await upload.json();
    return {
      platformPostId: String(video.id),
      permalink: `https://www.youtube.com/watch?v=${video.id}`,
    };
  }

  protected async doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    const res = await httpJson(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${platformPostId}`,
      { headers: { Authorization: `Bearer ${account.accessToken}` } },
    );
    if (res.status !== 200) {
      throw new ProviderError('YouTube stats failed', res.status, res.json);
    }
    const s = res.json.items?.[0]?.statistics ?? {};
    const views = Number(s.viewCount ?? 0);
    return {
      impressions: views,
      reach: views,
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      shares: 0,
      videoViews: views,
    };
  }

  protected async doFetchInbox(_account: SocialAccountRef, _since: string): Promise<InboxItem[]> {
    return []; // comment threads need per-video queries; poller covers posts only
  }

  protected async doReply(_account: SocialAccountRef, _externalMessageId: string, _text: string): Promise<void> {
    throw new ProviderError('YouTube replies are not supported yet');
  }

  protected async doVerifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return false;
  }
}
