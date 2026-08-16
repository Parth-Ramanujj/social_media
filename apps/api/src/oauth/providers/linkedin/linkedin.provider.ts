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
 * LinkedIn — Community Management API (posts) + Sign In with LinkedIn.
 * Docs: https://learn.microsoft.com/en-us/linkedin/
 */
@Injectable()
export class LinkedInProvider extends BaseProvider {
  readonly platform: Platform = 'linkedin';

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
  }

  private get clientId(): string {
    return this.config.get<string>('LINKEDIN_CLIENT_ID') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('LINKEDIN_CLIENT_SECRET') ?? '';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('platformEnabled.linkedin') === true && !!this.clientId && !!this.clientSecret;
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/linkedin`,
      // Modern LinkedIn (2024+): openid/profile/email replaced the deprecated
      // r_liteprofile/r_emailaddress; w_member_social enables posts.
      scope: 'w_member_social openid profile email',
      state: opts.state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string }): Promise<ProviderAuthResult> {
    const res = await httpJson('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code: opts.code,
        redirect_uri: `${opts.appUrl}/api/oauth/callback/linkedin`,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError('LinkedIn token exchange failed', res.status, res.json);
    }
    const me = await httpJson('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${res.json.access_token}` },
    });
    if (me.status !== 200) {
      throw new ProviderError('LinkedIn userinfo failed', me.status, me.json);
    }
    return {
      externalAccountId: String(me.json.sub),
      displayName: `${me.json.given_name ?? ''} ${me.json.family_name ?? ''}`.trim() || me.json.name || 'LinkedIn user',
      accessToken: res.json.access_token,
      refreshToken: res.json.refresh_token ?? null,
      expiresIn: Number(res.json.expires_in ?? null),
      metadata: { sub: String(me.json.sub), email: me.json.email ?? null },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    if (!account.refreshToken) {
      throw new ProviderError('LinkedIn account has no refresh token');
    }
    const res = await httpJson('https://www.linkedin.com/oauth/v2/accessToken', {
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
      throw new ProviderError('LinkedIn token refresh failed', res.status, res.json);
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
    const author = `urn:li:person:${account.externalAccountId}`;
    const body: Record<string, unknown> = {
      author,
      commentary: content.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED' },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (content.mediaUrls.length > 0) {
      body.content = {
        media: { mediaType: 'IMAGE', images: content.mediaUrls.slice(0, 9).map((url) => ({ url })) },
      };
    }
    const res = await httpJson('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202404',
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new ProviderError('LinkedIn post failed', res.status, res.json);
    }
    const postId = res.headers.get('x-restli-id') ?? `urn:li:share:${Date.now()}`;
    return {
      platformPostId: String(postId),
      permalink: `https://www.linkedin.com/feed/update/${postId}`,
    };
  }

  protected async doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    // postStats requires the post URN and a business entity; zeros are returned
    // for personal posts until a company-page account type is added.
    const shareUrn = platformPostId.includes('urn:li:share:') ? platformPostId : `urn:li:share:${platformPostId}`;
    const entity = `urn:li:person:${account.externalAccountId}`;
    const res = await httpJson(
      `https://api.linkedin.com/rest/postStats?q=organizationalEntity&organizationalEntity=${encodeURIComponent(entity)}&individualPosts=List(${encodeURIComponent(shareUrn)})`,
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'LinkedIn-Version': '202404',
        },
      },
    );
    if (res.status !== 200) {
      return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 };
    }
    const metrics = res.json?.individualPostStats?.[0]?.metrics ?? {};
    return {
      impressions: Number(metrics.impressionCount ?? 0),
      reach: Number(metrics.impressionCount ?? 0),
      likes: Number(metrics.likeCount ?? 0),
      comments: Number(metrics.commentCount ?? 0),
      shares: Number(metrics.shareCount ?? 0),
      videoViews: 0,
    };
  }

  protected async doFetchInbox(_account: SocialAccountRef, _since: string): Promise<InboxItem[]> {
    return []; // LinkedIn DMs need the messaging API + separate scopes
  }

  protected async doReply(_account: SocialAccountRef, _externalMessageId: string, _text: string): Promise<void> {
    throw new ProviderError('LinkedIn replies are not supported yet');
  }

  protected async doVerifyWebhook(_req: WebhookRequest): Promise<boolean> {
    return false;
  }
}
