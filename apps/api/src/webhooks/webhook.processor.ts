import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InboxMessageType, Prisma, WebhookEventStatus } from '@prisma/client';
import { NotificationService } from '../common/notifications/notification.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { WEBHOOK_QUEUE } from './webhooks.service';

const MAX_ATTEMPTS = 5;

/** Per-job normalization context: created rows counted per workspace. */
interface NormalizeCtx {
  workspaceCounts: Map<string, number>;
}

/**
 * Async handler for persisted webhook events.
 *
 * Normalizes Meta Graph (Pages/Instagram) and WhatsApp Cloud API payloads into
 * the unified Inbox model and upserts them by (platform, externalMessageId) —
 * the same idempotency key the pull-based sync uses, so webhook and poll paths
 * can never duplicate a message.
 *
 * Lifecycle: received -> processing -> processed | failed -> dead (after MAX_ATTEMPTS).
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger('WebhookProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<{ eventId: string }>): Promise<{ normalized: number }> {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: job.data.eventId },
    });
    if (!event) {
      return { normalized: 0 };
    }

    await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'processing', attempts: { increment: 1 } },
    });

    try {
      const ctx: NormalizeCtx = { workspaceCounts: new Map() };
      const normalized = await this.dispatch(event, ctx);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date() },
      });
      // New inbox rows => notify each affected workspace (publish failures and
      // sync events notify elsewhere; this is the webhook path only).
      for (const [workspaceId, count] of ctx.workspaceCounts) {
        await this.notifications.notifyWorkspace({
          workspaceId,
          type: 'inbox.new',
          title: `${count} new inbox ${count === 1 ? 'message' : 'messages'}`,
          body: 'Arrived via webhook from a connected account.',
        });
      }
      this.logger.log(
        JSON.stringify({
          requestId: job.id,
          event: 'webhook_processed',
          eventId: event.id,
          platform: event.platform,
          source: event.source,
          normalized,
        }),
      );
      return { normalized };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'failed', lastError: message.slice(0, 500) },
      });
      this.logger.warn(
        JSON.stringify({
          requestId: job.id,
          event: 'webhook_failed',
          eventId: event.id,
          attempts: event.attempts + 1,
          message,
        }),
      );
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ eventId: string }>, error: Error) {
    if (job.attemptsMade >= MAX_ATTEMPTS) {
      await this.prisma.webhookEvent.update({
        where: { id: job.data.eventId },
        data: { status: 'dead', lastError: error.message.slice(0, 500) },
      });
      this.logger.error(
        JSON.stringify({
          requestId: job.id,
          event: 'webhook_dead',
          eventId: job.data.eventId,
          message: error.message,
        }),
      );
    }
  }

  /** Route the persisted payload to a normalizer. Returns rows upserted. */
  private async dispatch(
    event: {
      id: string;
      platform: string;
      payload: Prisma.JsonValue;
    },
    ctx: NormalizeCtx,
  ): Promise<number> {
    const payload = (event.payload ?? {}) as any;
    const object = payload?.object;
    if (event.platform === 'whatsapp' || object === 'whatsapp_business_account') {
      return this.normalizeWhatsApp(payload, ctx);
    }
    if (object === 'instagram') {
      return this.normalizeInstagram(payload, ctx);
    }
    // Default: Facebook Pages (object = 'page')
    return this.normalizePage(payload, ctx);
  }

  private async normalizePage(payload: any, ctx: NormalizeCtx): Promise<number> {
    const entries = payload?.entry ?? [];
    let upserted = 0;
    for (const entry of entries) {
      const pageId = String(entry.id ?? '');
      const account = await this.resolveMetaAccount(pageId, 'page');
      for (const change of entry.changes ?? []) {
        const field = change?.field;
        const value = change?.value ?? {};
        if (field === 'comments') {
          const comment = value.comment ?? value;
          if (comment?.id) {
            upserted += await this.upsertInbox(
              account,
              {
                externalMessageId: String(comment.id),
                type: 'comment',
                senderName: comment.from?.name ?? comment.from?.id ?? 'Unknown',
                content: String(comment.message ?? comment.text ?? '').slice(0, 5000),
                createdAt: this.parseDate(comment.created_time) ?? new Date(),
              },
              'meta',
              ctx,
            );
          }
        } else if (field === 'messages' && !value.message?.is_echo) {
          const message = value.message ?? {};
          const mid = message.mid;
          if (mid) {
            upserted += await this.upsertInbox(
              account,
              {
                externalMessageId: String(mid),
                type: 'dm',
                senderName: value.sender?.id ? `FB:${value.sender.id}` : 'Unknown',
                content: String(message.text ?? '').slice(0, 5000) || '[attachment]',
                createdAt: this.parseDate(value.timestamp) ?? new Date(),
              },
              'meta',
              ctx,
            );
          }
        }
        // feed/mention/etc fields are logged via WebhookEvent persistence only.
      }
    }
    return upserted;
  }

  private async normalizeInstagram(payload: any, ctx: NormalizeCtx): Promise<number> {
    const entries = payload?.entry ?? [];
    let upserted = 0;
    for (const entry of entries) {
      const igUserId = String(entry.id ?? '');
      const account = await this.resolveMetaAccount(igUserId, 'ig');
      for (const change of entry.changes ?? []) {
        const field = change?.field;
        const value = change?.value ?? {};
        if (field === 'comments') {
          const comment = value.comment ?? value;
          if (comment?.id) {
            upserted += await this.upsertInbox(
              account,
              {
                externalMessageId: String(comment.id),
                type: 'comment',
                senderName: comment.from?.username ?? comment.from?.id ?? 'Unknown',
                content: String(comment.text ?? '').slice(0, 5000),
                createdAt: this.parseDate(comment.created_at ?? comment.created_time) ?? new Date(),
              },
              'meta',
              ctx,
            );
          }
        } else if (field === 'messages') {
          const message = value.message ?? {};
          if (message.mid) {
            upserted += await this.upsertInbox(
              account,
              {
                externalMessageId: String(message.mid),
                type: 'dm',
                senderName: value.sender?.id ? `IG:${value.sender.id}` : 'Unknown',
                content: String(message.text ?? '').slice(0, 5000) || '[attachment]',
                createdAt: this.parseDate(value.timestamp) ?? new Date(),
              },
              'meta',
              ctx,
            );
          }
        }
      }
    }
    return upserted;
  }

  private async normalizeWhatsApp(payload: any, ctx: NormalizeCtx): Promise<number> {
    const entries = payload?.entry ?? [];
    let upserted = 0;
    for (const entry of entries) {
      const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id;
      const account = phoneNumberId
        ? await this.resolveWhatsAppAccount(String(phoneNumberId))
        : null;
      for (const change of entry.changes ?? []) {
        const value = change?.value ?? {};
        const contacts = new Map<string, string>();
        for (const contact of value.contacts ?? []) {
          contacts.set(String(contact.wa_id), contact.profile?.name ?? '');
        }
        for (const message of value.messages ?? []) {
          if (!message?.id) {
            continue;
          }
          const from = String(message.from ?? '');
          upserted += await this.upsertInbox(
            account,
            {
              externalMessageId: String(message.id),
              type: 'dm',
              senderName: contacts.get(from) || from || 'Unknown',
              content: this.whatsAppContent(message),
              createdAt: this.parseWhatsAppTimestamp(message.timestamp) ?? new Date(),
              metadata: { from, messageType: message.type },
            },
            'whatsapp',
            ctx,
          );
        }
        // statuses (sent/delivered/read/failed) are persisted as WebhookEvents
        // for audit; the Inbox has no per-message delivery state in v1.
      }
    }
    return upserted;
  }

  private whatsAppContent(message: any): string {
    const type = message.type ?? 'unknown';
    switch (type) {
      case 'text':
        return String(message.text?.body ?? '').slice(0, 5000);
      case 'image':
        return message.image?.caption ? `[image] ${message.image.caption}`.slice(0, 5000) : '[image]';
      case 'video':
        return message.video?.caption ? `[video] ${message.video.caption}`.slice(0, 5000) : '[video]';
      case 'audio':
        return '[audio]';
      case 'document':
        return message.document?.filename ? `[document] ${message.document.filename}`.slice(0, 5000) : '[document]';
      case 'sticker':
        return '[sticker]';
      case 'location':
        return '[location]';
      case 'contacts':
        return '[contact]';
      case 'interactive':
        return '[interactive]';
      case 'button':
        return String(message.button?.text ?? '[button]').slice(0, 5000);
      default:
        return `[${type}]`;
    }
  }

  private async resolveMetaAccount(externalId: string, kind: 'page' | 'ig') {
    const where: Prisma.SocialAccountWhereInput =
      kind === 'ig'
        ? { platform: 'meta', metadata: { path: ['igBusinessAccountId'], equals: externalId } }
        : { platform: 'meta', externalAccountId: externalId };
    return this.prisma.socialAccount.findFirst({
      where,
      select: { id: true, workspaceId: true },
    });
  }

  private async resolveWhatsAppAccount(phoneNumberId: string) {
    return this.prisma.socialAccount.findFirst({
      where: { platform: 'whatsapp', metadata: { path: ['phoneNumberId'], equals: phoneNumberId } },
      select: { id: true, workspaceId: true },
    });
  }

  private async upsertInbox(
    account: { id: string; workspaceId: string } | null,
    item: {
      externalMessageId: string;
      type: InboxMessageType;
      senderName: string;
      content: string;
      createdAt: Date;
      metadata?: Record<string, unknown>;
    },
    platform: 'meta' | 'whatsapp',
    ctx: NormalizeCtx,
  ): Promise<number> {
    if (!account) {
      return 0;
    }
    // Same unique key as the pull-based sync: [platform, externalMessageId] —
    // webhook and poll paths can never duplicate a message.
    const existing = await this.prisma.inbox.findUnique({
      where: {
        platform_externalMessageId: { platform, externalMessageId: item.externalMessageId },
      },
      select: { id: true },
    });
    if (existing) {
      // Idempotent re-delivery (Meta retries): refresh metadata only, no
      // new-notification (keeps the bell quiet on duplicate deliveries).
      await this.prisma.inbox.update({
        where: { id: existing.id },
        data: {
          senderName: item.senderName,
          content: item.content,
          metadata: item.metadata ? (item.metadata as Prisma.InputJsonObject) : undefined,
        },
      });
      return 0;
    }
    await this.prisma.inbox.create({
      data: {
        socialAccountId: account.id,
        platform,
        externalMessageId: item.externalMessageId,
        type: item.type,
        senderName: item.senderName,
        content: item.content,
        metadata: item.metadata ? (item.metadata as Prisma.InputJsonObject) : undefined,
        createdAt: item.createdAt,
      },
    });
    ctx.workspaceCounts.set(account.workspaceId, (ctx.workspaceCounts.get(account.workspaceId) ?? 0) + 1);
    return 1;
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const ms = typeof value === 'number' && value < 1e12 ? value * 1000 : value;
      const date = new Date(ms as number | string);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private parseWhatsAppTimestamp(value: unknown): Date | null {
    if (typeof value !== 'number') {
      return this.parseDate(value);
    }
    // WhatsApp webhook timestamps are seconds; Messenger uses ms.
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
}
