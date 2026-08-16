import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Platform } from '@pulse/shared-types';
import {
  InboxItem,
  ProviderAuthResult,
  ProviderMetrics,
  RateLimitInfo,
  SocialAccountRef,
  WebhookRequest,
} from '../../social-provider.interface';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { formBody, httpJson, ProviderError } from '../../http.util';
import { BaseProvider } from '../base.provider';
import { ProviderRegistry } from '../../provider-registry.service';

const SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_messages',
  'read_insights',
  'business_management',
  'pages_messaging',
].join(',');

/**
 * Meta Graph API — Facebook Pages + Instagram Business.
 * Reference implementation for the SocialProvider interface.
 * Docs: https://developers.facebook.com/docs/graph-api
 */
@Injectable()
export class MetaProvider extends BaseProvider {
  readonly platform: Platform = 'meta';

  private readonly apiVersion: string;

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
    this.apiVersion = config.get<string>('META_APP_VERSION') ?? 'v26.0';
  }

  private get appId(): string {
    return this.config.get<string>('META_APP_ID') ?? '';
  }

  private get appSecret(): string {
    return this.config.get<string>('META_APP_SECRET') ?? '';
  }

  get enabled(): boolean {
    return this.config.get<boolean>('platformEnabled.meta') === true && !!this.appId && !!this.appSecret;
  }

  private graph(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}/${path}`;
  }

  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: `${opts.appUrl}/api/oauth/callback/meta`,
      state: opts.state,
      scope: SCOPES,
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params}`;
  }

  protected async doExchangeCode(opts: { code: string; appUrl: string }): Promise<ProviderAuthResult> {
    const short = await httpJson(
      this.graph('oauth/access_token') +
        '?' +
        new URLSearchParams({
          client_id: this.appId,
          client_secret: this.appSecret,
          redirect_uri: `${opts.appUrl}/api/oauth/callback/meta`,
          code: opts.code,
        }),
    );
    if (short.status !== 200) {
      throw new ProviderError('Meta token exchange failed', short.status, short.json);
    }
    const shortToken = short.json.access_token as string;

    // Exchange the short-lived user token for a long-lived one (60 days).
    const long = await httpJson(
      this.graph('oauth/access_token') +
        '?' +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortToken,
        }),
    );
    const accessToken = (long.json.access_token ?? shortToken) as string;

    const pages = await httpJson(
      this.graph('me/accounts') +
        '?' +
        new URLSearchParams({
          access_token: accessToken,
          fields: 'id,name,category,access_token,instagram_business_account',
          limit: '100',
        }),
    );
    if (pages.status !== 200) {
      throw new ProviderError('Meta /me/accounts failed', pages.status, pages.json);
    }
    const first = pages.json.data?.[0];
    if (!first) {
      throw new ProviderError('No Facebook Pages found for this account — create one first', pages.status, pages.json);
    }
    return {
      externalAccountId: String(first.id),
      displayName: String(first.name ?? `Page ${first.id}`),
      accessToken: String(first.access_token ?? accessToken),
      refreshToken: null, // page tokens don't refresh; re-auth via long-lived app flow
      expiresIn: null,
      metadata: {
        category: first.category ?? null,
        igBusinessAccountId: first.instagram_business_account?.id ?? null,
        pageId: String(first.id),
      },
    };
  }

  protected async doRefreshToken(account: SocialAccountRef) {
    // Page tokens can't be refreshed silently. Instead mint a fresh long-lived
    // token from the app pair; if that fails the account needs re-connect.
    const url =
      this.graph('oauth/access_token') +
      '?' +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: account.accessToken,
      });
    const res = await httpJson(url);
    if (res.status !== 200) {
      throw new ProviderError('Meta token refresh failed', res.status, res.json);
    }
    return { accessToken: res.json.access_token, refreshToken: null, expiresIn: 60 * 24 * 60 * 60 };
  }

  protected async doPublish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    _opts: { providerIdempotencyKey: string },
  ) {
    const token = account.accessToken;
    const pageId = account.externalAccountId;
    const igId = (account.metadata?.igBusinessAccountId as string | null) ?? null;

    if (igId && content.mediaUrls.length > 0) {
      // Instagram Business: media container -> publish. Images only for now.
      const media = await httpJson(
        this.graph(`${igId}/media`) +
          '?' +
          new URLSearchParams({
            image_url: content.mediaUrls[0],
            caption: content.text,
            access_token: token,
          }),
        { method: 'POST' },
      );
      if (media.status !== 200) {
        throw new ProviderError(this.fbError('Meta IG media container failed', media), media.status, media.json);
      }
      const publish = await httpJson(
        this.graph(`${igId}/media_publish`) +
          '?' +
          new URLSearchParams({ creation_id: String(media.json.id), access_token: token }),
        { method: 'POST' },
      );
      if (publish.status !== 200) {
        throw new ProviderError(this.fbError('Meta IG media_publish failed', publish), publish.status, publish.json);
      }
      return {
        platformPostId: String(publish.json.id),
        permalink: `https://www.instagram.com/p/${publish.json.id}/`,
        rateLimit: this.parseRateLimit(this.headersOf(media)),
      };
    }

    // Facebook Page post: /feed for text, /photos for a single image.
    const body = new URLSearchParams({ access_token: token });
    const singleImage = content.mediaUrls[0] && content.mediaUrls.length === 1;
    const endpoint = singleImage ? `${pageId}/photos` : `${pageId}/feed`;
    if (singleImage) {
      body.set('url', content.mediaUrls[0]);
      body.set('caption', content.text);
      body.set('published', 'true');
    } else if (content.mediaUrls.length > 1) {
      body.set('message', content.text);
      content.mediaUrls.forEach((url, i) => body.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: url })));
    } else {
      body.set('message', content.text);
    }
    const res = await httpJson(this.graph(endpoint) + '?' + body.toString(), { method: 'POST' });
    if (res.status !== 200) {
      throw new ProviderError(this.fbError('Meta page post failed', res), res.status, res.json);
    }
    return {
      platformPostId: String(res.json.id),
      permalink: `https://www.facebook.com/${pageId}/posts/${res.json.id}`,
      rateLimit: this.parseRateLimit(this.headersOf(res)),
    };
  }

  protected async doFetchPostMetrics(account: SocialAccountRef, platformPostId: string): Promise<ProviderMetrics> {
    const res = await httpJson(
      this.graph(`${platformPostId}/insights`) +
        '?' +
        new URLSearchParams({ metric: 'reach,impressions,engaged_users', access_token: account.accessToken }),
    );
    if (res.status !== 200) {
      throw new ProviderError('Meta insights failed', res.status, res.json);
    }
    const values: Record<string, number> = {};
    for (const row of res.json.data ?? []) {
      values[row.name] = Number(row.values?.at(-1)?.value ?? 0);
    }
    return {
      reach: values.reach ?? 0,
      impressions: values.impressions ?? 0,
      likes: values.engaged_users ?? 0,
      comments: 0,
      shares: 0,
      videoViews: 0,
    };
  }

  protected async doFetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]> {
    const sinceMs = new Date(since).getTime();
    const token = account.accessToken;
    const pageId = account.externalAccountId;
    const items: InboxItem[] = [];
    const q = (params: Record<string, string>) => '?' + new URLSearchParams(params).toString();

    // Page-level /comments is unreliable (404s on some pages), so walk the
    // recent feed and pull comments per post — this works for pages and profiles.
    const feed = await httpJson(
      this.graph(`${pageId}/feed`) +
        q({ access_token: token, fields: 'id', limit: '25' }),
    );
    if (feed.status !== 200) {
      throw new ProviderError('Meta feed fetch failed', feed.status, feed.json);
    }
    for (const post of feed.json.data ?? []) {
      const comments = await httpJson(
        this.graph(`${post.id}/comments`) +
          q({
            access_token: token,
            fields: 'id,message,from{name,id},created_time,parent{id}',
            limit: '100',
          }),
      );
      if (comments.status !== 200) {
        continue;
      }
      for (const c of comments.json.data ?? []) {
        const createdAt = new Date(c.created_time);
        if (createdAt.getTime() < sinceMs) continue;
        items.push({
          externalMessageId: String(c.id),
          type: 'comment',
          senderName: c.from?.name ?? 'Unknown',
          content: c.message ?? '',
          createdAt,
          raw: { parentId: c.parent?.id ?? null },
        });
      }
    }

    const igId = account.metadata?.igBusinessAccountId as string | undefined;
    if (igId) {
      try {
        const igMedia = await httpJson(
          this.graph(`${igId}/media`) +
            q({ access_token: token, fields: 'id', limit: '25' }),
        );
        if (igMedia.status === 200) {
          for (const post of igMedia.json.data ?? []) {
            const comments = await httpJson(
              this.graph(`${post.id}/comments`) +
                q({
                  access_token: token,
                  fields: 'id,text,from{username,id},timestamp',
                  limit: '100',
                }),
            );
            if (comments.status === 200) {
              for (const c of comments.json.data ?? []) {
                const createdAt = new Date(c.timestamp);
                if (createdAt.getTime() < sinceMs) continue;
                items.push({
                  externalMessageId: String(c.id),
                  type: 'comment',
                  senderName: c.from?.username ?? 'Instagram User',
                  content: c.text ?? '',
                  createdAt,
                  raw: { parentId: null },
                });
              }
            }
          }
        }
      } catch (e) {
        /* ignore IG fetch errors */
      }
    }

    // Messenger DMs (best effort — pages without messaging configured return []).
    try {
      const convs = await httpJson(
        this.graph(`${pageId}/conversations`) +
          q({
            access_token: token,
            fields: 'id,updated_time,messages.limit(1){id,message,from{name,id},created_time}',
            limit: '50',
          }),
      );
      if (convs.status === 200) {
        for (const conv of convs.json.data ?? []) {
          const last = conv.messages?.data?.[0];
          if (!last) continue;
          const createdAt = new Date(last.created_time ?? conv.updated_time);
          if (createdAt.getTime() < sinceMs) continue;
          items.push({
            externalMessageId: String(last.id),
            type: 'dm',
            senderName: last.from?.name ?? 'Unknown',
            content: last.message ?? '',
            createdAt,
            raw: { conversationId: String(conv.id), participantId: last.from?.id ?? null },
          });
        }
      }
    } catch {
      /* conversations unavailable — comments only */
    }

    // Instagram DMs
    if (igId) {
      try {
        const igConvs = await httpJson(
          this.graph(`${igId}/conversations`) +
            q({
              platform: 'instagram',
              access_token: token,
              fields: 'id,updated_time,messages.limit(1){id,message,from{name,username,id},created_time}',
              limit: '50',
            }),
        );
        if (igConvs.status === 200) {
          for (const conv of igConvs.json.data ?? []) {
            const last = conv.messages?.data?.[0];
            if (!last) continue;
            const createdAt = new Date(last.created_time ?? conv.updated_time);
            if (createdAt.getTime() < sinceMs) continue;
            items.push({
              externalMessageId: String(last.id),
              type: 'dm',
              senderName: last.from?.username ?? last.from?.name ?? 'Instagram User',
              content: last.message ?? '',
              createdAt,
              raw: { conversationId: String(conv.id), participantId: last.from?.id ?? null },
            });
          }
        }
      } catch {
        /* ignore IG DM errors */
      }
    }

    return items;
  }

  protected async doReply(account: SocialAccountRef, externalMessageId: string, text: string): Promise<void> {
    const token = account.accessToken;
    // Messenger DM ids start with m_ and can't use /replies. Resolve the
    // participant from the message, then send via the Messenger Send API.
    if (externalMessageId.startsWith('m_')) {
      const msg = await httpJson(
        this.graph(externalMessageId) +
          '?' +
          new URLSearchParams({ access_token: token, fields: 'from{id}' }),
      );
      if (msg.status !== 200) {
        throw new ProviderError('Meta DM participant fetch failed', msg.status, msg.json);
      }
      const recipientId = msg.json?.from?.id;
      if (!recipientId) {
        throw new ProviderError('Meta DM has no resolvable recipient', msg.status, msg.json);
      }
      const send = await httpJson(
        this.graph('me/messages') + '?' + new URLSearchParams({ access_token: token }),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
            messaging_type: 'RESPONSE',
          }),
        },
      );
      if (send.status !== 200) {
        throw new ProviderError(this.fbError('Meta DM reply failed', send), send.status, send.json);
      }
      return;
    }

    const res = await httpJson(
      this.graph(`${externalMessageId}/replies`) +
        '?' +
        new URLSearchParams({ message: text, access_token: token }),
      { method: 'POST' },
    );
    if (res.status !== 200) {
      throw new ProviderError(this.fbError('Meta reply failed', res), res.status, res.json);
    }
  }

  protected async doVerifyWebhook(req: WebhookRequest): Promise<boolean> {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig || Array.isArray(sig)) {
      return false;
    }
    const expected = 'sha256=' + createHmac('sha256', this.appSecret).update(req.rawBody).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseRateLimit(headers: Record<string, string | string[] | undefined>): RateLimitInfo | null {
    const usage = headers['x-app-usage'];
    if (!usage || Array.isArray(usage)) {
      return null;
    }
    try {
      const parsed = JSON.parse(usage);
      const seconds = parsed.call_count?.estimated_time_to_regain_access;
      if (typeof seconds === 'number') {
        return { resetAt: new Date(Date.now() + seconds * 1000).toISOString() };
      }
    } catch {
      /* ignore malformed */
    }
    return null;
  }

  private headersOf(res: { headers: Headers }): Record<string, string | string[] | undefined> {
    const out: Record<string, string | string[] | undefined> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    return out;
  }

  /** Human-friendly Graph API error; prefers FB's user-facing detail when present. */
  private fbError(prefix: string, res: { status: number; json: any }): string {
    const err = res.json?.error ?? {};
    const detail =
      err.error_user_msg ??
      err.message ??
      JSON.stringify(res.json ?? {}).slice(0, 300);
    const code = err.code ? `, code ${err.code}` : '';
    return `${prefix} (${res.status}${code}): ${detail}`;
  }
}