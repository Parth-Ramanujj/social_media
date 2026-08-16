import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Platform } from '@pulse/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';

export const WEBHOOK_QUEUE = 'webhook-events';

const HUB_SIGNATURE_PREFIX = 'sha256=';

/**
 * Webhook ingestion for Meta (Graph API Pages/Instagram + WhatsApp Cloud API).
 *
 * Responsibilities:
 *  - GET handshake verify-token checks (per platform).
 *  - X-Hub-Signature-256 HMAC verification over the RAW body (app secret).
 *  - Idempotent persistence: every payload is stored once (unique sha256 hash);
 *    re-deliveries of an identical payload are acknowledged without reprocessing.
 *  - Async processing via BullMQ so the HTTP response is never blocked.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  private appSecret(): string {
    return this.config.get<string>('META_APP_SECRET') ?? '';
  }

  private verifyTokenFor(platform: Platform): string {
    return platform === 'whatsapp'
      ? this.config.get<string>('whatsapp.webhookVerifyToken') ?? ''
      : this.config.get<string>('meta.webhookVerifyToken') ?? '';
  }

  /** GET handshake: does the caller-supplied token match ours for this platform? */
  isValidVerifyToken(platform: Platform, token: string | undefined): boolean {
    const expected = this.verifyTokenFor(platform);
    if (!expected || !token) {
      return false;
    }
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** X-Hub-Signature-256 = sha256=HMAC_SHA256(appSecret, rawBody), constant-time compare. */
  verifySignature(platform: Platform, rawBody: Buffer, signature: string): boolean {
    const secret = this.appSecret();
    if (!secret) {
      return false;
    }
    if (!signature.startsWith(HUB_SIGNATURE_PREFIX)) {
      return false;
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signature.slice(HUB_SIGNATURE_PREFIX.length));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Persist one WebhookEvent per HTTP delivery and enqueue it.
   * Returns true when the payload was new (or being retried), false when it was
   * an already-processed duplicate.
   */
  async ingest(platform: Platform, rawBody: Buffer): Promise<boolean> {
    const eventHash = createHash('sha256').update(rawBody).digest('hex');
    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventHash } });
    if (existing) {
      // Already processed, in-flight, or permanently dead: acknowledge without
      // reprocessing. Only received/failed re-enqueue (self-heals a crash
      // between persist and enqueue; retries after a processor error).
      if (
        existing.status === 'processed' ||
        existing.status === 'processing' ||
        existing.status === 'dead'
      ) {
        return false;
      }
      // BullMQ dedupes adds on existing job ids (including failed jobs), so remove it first.
      const jobId = `webhook_${existing.id}`;
      await this.queue.remove(jobId).catch(() => undefined);
      await this.enqueue(existing.id, jobId);
      return true;
    }

    let payload: unknown = null;
    let externalEventId: string | null = null;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
      externalEventId = this.extractExternalEventId(payload);
    } catch {
      payload = { raw: rawBody.toString('utf8').slice(0, 2000) };
    }

    const workspaceId = await this.resolveWorkspaceId(platform, payload);

    const event = await this.prisma.webhookEvent.create({
      data: {
        platform,
        source: platform === 'whatsapp' ? 'whatsapp_business_account' : 'page',
        externalEventId,
        eventHash,
        payload: payload as object,
        workspaceId,
        status: 'received',
      },
    });

    await this.enqueue(event.id, `webhook_${event.id}`);
    return true;
  }

  private async enqueue(eventId: string, jobId: string): Promise<void> {
    await this.queue.add(
      WEBHOOK_QUEUE,
      { eventId },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 7 * 86_400, count: 10_000 },
      },
    );
  }

  /** Best-effort platform event/message id for observability (dedupe uses the hash). */
  private extractExternalEventId(payload: any): string | null {
    const entries = payload?.entry;
    if (!Array.isArray(entries)) {
      return null;
    }
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const value = change?.value ?? {};
        if (Array.isArray(value.messages) && value.messages[0]?.id) {
          return value.messages[0].id;
        }
        if (Array.isArray(value.statuses) && value.statuses[0]?.id) {
          return value.statuses[0].id;
        }
        if (value.comment?.id) {
          return value.comment.id;
        }
        if (value.message?.mid) {
          return value.message.mid;
        }
      }
    }
    return null;
  }

  /** Resolve the owning workspace from the event payload (page id / phone number id). */
  private async resolveWorkspaceId(platform: Platform, payload: any): Promise<string | null> {
    const entry = payload?.entry?.[0];
    if (!entry) {
      return null;
    }
    if (platform === 'whatsapp') {
      const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        const account = await this.prisma.socialAccount.findFirst({
          where: {
            platform: 'whatsapp',
            metadata: { path: ['phoneNumberId'], equals: String(phoneNumberId) },
          },
          select: { workspaceId: true },
        });
        return account?.workspaceId ?? null;
      }
      return null;
    }
    // Meta Graph (page / instagram objects): entry.id is the page id.
    const pageId = String(entry.id ?? '');
    if (pageId) {
      const account = await this.prisma.socialAccount.findFirst({
        where: { platform: 'meta', externalAccountId: pageId },
        select: { workspaceId: true },
      });
      return account?.workspaceId ?? null;
    }
    return null;
  }
}
