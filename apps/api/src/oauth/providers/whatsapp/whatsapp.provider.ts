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
import { httpJson, ProviderError } from '../../http.util';
import { BaseProvider } from '../base.provider';
import { ProviderRegistry } from '../../provider-registry.service';

/**
 * WhatsApp Business Platform (Cloud API) — https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Unlike the OAuth platforms, WhatsApp authenticates with a PERMANENT access
 * token for the business app plus the phone number id of a subscribed number,
 * both supplied in .env:
 *   WHATSAPP_ENABLED=true, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 *   WHATSAPP_PUBLISH_TO (recipient for the composer's publish action).
 *
 * There is no consent screen: "connect" validates the configured credential
 * pair against the Graph API and stores the phone number as the connected
 * account. Incoming messages arrive via the webhook module (HMAC-verified,
 * normalized into Inbox DM rows with `metadata.from` = sender wa_id), which is
 * what `reply` targets. Publishing is a real outbound message to the configured
 * recipient (WhatsApp has no public feed). Without credentials the provider
 * runs in dry-run mode like every other platform.
 */
@Injectable()
export class WhatsAppProvider extends BaseProvider {
  readonly platform: Platform = 'whatsapp';

  private readonly apiVersion: string;

  constructor(config: ConfigService, registry: ProviderRegistry) {
    super(config);
    registry.register(this);
    this.apiVersion = config.get<string>('META_APP_VERSION') ?? 'v26.0';
  }

  private get phoneNumberId(): string {
    return this.config.get<string>('whatsapp.phoneNumberId') ?? '';
  }

  private get accessToken(): string {
    return this.config.get<string>('whatsapp.accessToken') ?? '';
  }

  private get publishTo(): string {
    return this.config.get<string>('whatsapp.publishTo') ?? '';
  }

  get enabled(): boolean {
    return (
      this.config.get<boolean>('platformEnabled.whatsapp') === true &&
      !!this.phoneNumberId &&
      !!this.accessToken
    );
  }

  private graph(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}/${path}`;
  }

  /** No OAuth consent exists; authorize = validate the configured token+number. */
  getAuthorizationUrl(opts: { state: string; appUrl: string }): string {
    return `${opts.appUrl}/api/oauth/callback/whatsapp?state=${opts.state}`;
  }

  protected async doExchangeCode(
    opts: { code: string; appUrl: string },
  ): Promise<ProviderAuthResult> {
    const res = await httpJson(
      this.graph(this.phoneNumberId) +
        '?' +
        new URLSearchParams({
          access_token: this.accessToken,
          fields: 'id,display_phone_number,verified_name',
        }),
    );
    if (res.status !== 200) {
      throw new ProviderError('WhatsApp credential validation failed', res.status, res.json);
    }
    const display = [res.json.verified_name, res.json.display_phone_number]
      .filter(Boolean)
      .join(' · ');
    return {
      externalAccountId: String(res.json.id ?? this.phoneNumberId),
      displayName: display || 'WhatsApp account',
      accessToken: this.accessToken,
      refreshToken: null,
      expiresIn: null,
      metadata: {
        phoneNumberId: this.phoneNumberId,
        verifiedName: res.json.verified_name ?? null,
        displayPhoneNumber: res.json.display_phone_number ?? null,
      },
    };
  }

  /** Cloud API tokens are permanent; the hourly worker skips whatsapp already. */
  protected async doRefreshToken(
    account: SocialAccountRef,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null }> {
    throw new ProviderError(
      'WhatsApp access tokens are permanent — reconnect the account if it was invalidated',
    );
  }

  protected async doPublish(
    account: SocialAccountRef,
    content: { text: string; mediaUrls: string[] },
    opts: { providerIdempotencyKey: string },
  ): Promise<{ platformPostId: string; permalink?: string; rateLimit?: RateLimitInfo | null }> {
    const to = this.publishTo.replace(/[^\d]/g, '');
    if (!to) {
      throw new ProviderError(
        'WHATSAPP_PUBLISH_TO is not set — set a recipient phone number (E.164) to publish WhatsApp messages',
      );
    }
    // One message per delivery: text, or a single image with an optional caption
    // (the Cloud API rejects text+image payloads together).
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
    };
    if (content.mediaUrls.length > 0) {
      body.type = 'image';
      body.image = { link: content.mediaUrls[0] };
      if (content.text) {
        (body.image as Record<string, unknown>).caption = content.text.slice(0, 1024);
      }
    } else {
      body.type = 'text';
      body.text = { body: content.text.slice(0, 4096), preview_url: false };
    }

    const res = await httpJson(this.graph(`${this.phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 200) {
      throw new ProviderError(this.waError('WhatsApp publish failed', res), res.status, res.json);
    }
    const platformPostId = String(res.json.messages?.[0]?.id ?? 'unknown');
    return { platformPostId, permalink: undefined, rateLimit: this.parseRateLimit(this.headersOf(res)) };
  }

  /** WhatsApp has no post-level insights; status webhooks stay audit-only. */
  protected async doFetchPostMetrics(
    account: SocialAccountRef,
    platformPostId: string,
  ): Promise<ProviderMetrics> {
    return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, videoViews: 0 };
  }

  /** Inbox is webhook-fed (no list endpoint without a paid Conversations API); poll stays empty. */
  protected async doFetchInbox(account: SocialAccountRef, since: string): Promise<InboxItem[]> {
    return [];
  }

  protected async doReply(
    account: SocialAccountRef,
    externalMessageId: string,
    text: string,
    context?: { metadata?: Record<string, unknown> },
  ): Promise<void> {
    const from = String(context?.metadata?.from ?? '').replace(/[^\d]/g, '');
    if (!from) {
      throw new ProviderError(
        'WhatsApp replies need the sender wa_id — only webhook-received messages can be replied to',
      );
    }
    const res = await httpJson(this.graph(`${this.phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: from,
        type: 'text',
        text: { body: text.slice(0, 4096), preview_url: false },
      }),
    });
    if (res.status !== 200) {
      throw new ProviderError(this.waError('WhatsApp reply failed', res), res.status, res.json);
    }
  }

  /** Signatures are verified at the controller with META_APP_SECRET (shared app secret). */
  protected async doVerifyWebhook(req: WebhookRequest): Promise<boolean> {
    return true;
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

  /** Human-friendly WhatsApp Cloud error; prefers the API's error_data.details. */
  private waError(prefix: string, res: { status: number; json: any }): string {
    const err = res.json?.error ?? {};
    const detail =
      err.error_data?.details ??
      err.error_user_msg ??
      err.message ??
      err.error_subcode ??
      JSON.stringify(res.json ?? {}).slice(0, 300);
    const code = err.code ? `, code ${err.code}` : '';
    return `${prefix} (${res.status}${code}): ${detail}`;
  }
}