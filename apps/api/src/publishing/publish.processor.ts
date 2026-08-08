import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationService } from '../common/notifications/notification.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProviderRegistry } from '../oauth/provider-registry.service';
import { SocialAccountRef } from '../oauth/social-provider.interface';
import { RateLimitedError } from '../oauth/http.util';

interface PublishJobData {
  variantId: string;
}

/**
 * Consumer for the `publish` queue.
 *
 * Idempotency chain (safe to retry without duplicate posts):
 *  1. jobId == publishingKey (BullMQ dedupes enqueues),
 *  2. processor skips variants already carrying a platformPostId,
 *  3. publish() passes the same idempotency key to the provider (X: header,
 *     others rely on 1+2 + post-publish verification via fetch).
 */
@Processor('publish')
@Injectable()
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly registry: ProviderRegistry,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>) {
    const { variantId } = job.data;
    const variant = await this.prisma.postPlatformVariant.findUnique({
      where: { id: variantId },
      include: { post: true, socialAccount: true },
    });
    if (!variant) {
      return 'variant-gone';
    }
    // Idempotency guard 2: already published (e.g. retry after success).
    if (variant.platformPostId) {
      return 'already-published';
    }
    if (variant.publishStatus !== 'scheduled') {
      return `skipped (${variant.publishStatus})`;
    }

    await this.prisma.postPlatformVariant.update({
      where: { id: variantId },
      data: { publishStatus: 'publishing' },
    });

    const provider = this.registry.get(variant.platform);
    const accountRef: SocialAccountRef = {
      id: variant.socialAccount.id,
      workspaceId: variant.socialAccount.workspaceId,
      platform: variant.platform,
      externalAccountId: variant.socialAccount.externalAccountId,
      displayName: variant.socialAccount.displayName,
      accessToken: this.encryption.decrypt(variant.socialAccount.accessTokenEncrypted),
      refreshToken: variant.socialAccount.refreshTokenEncrypted
        ? this.encryption.decrypt(variant.socialAccount.refreshTokenEncrypted)
        : null,
      tokenExpiresAt: variant.socialAccount.tokenExpiresAt,
      metadata: (variant.socialAccount.metadata ?? {}) as Record<string, unknown>,
    };

    const { result, rateLimit } = await provider.publish(
      accountRef,
      { text: variant.contentText, mediaUrls: variant.mediaUrls },
      { providerIdempotencyKey: `pub:${variant.id}` },
    );

    await this.prisma.$transaction([
      this.prisma.postPlatformVariant.update({
        where: { id: variantId },
        data: {
          publishStatus: 'published',
          platformPostId: result.platformPostId,
          publishedAt: new Date(),
          errorMessage: null,
        },
      }),
      // Persist rate-limit info for the backoff logic on future publishes.
      ...(rateLimit?.resetAt
        ? [
            this.prisma.socialAccount.update({
              where: { id: variant.socialAccount.id },
              data: {
                metadata: {
                  ...((variant.socialAccount.metadata ?? {}) as Record<string, unknown>),
                  rateLimit,
                } as unknown as Prisma.InputJsonValue,
              },
            }),
          ]
        : []),
    ]);

    const pending = await this.prisma.postPlatformVariant.count({
      where: { postId: variant.postId, publishStatus: { not: 'published' } },
    });
    if (pending === 0) {
      await this.prisma.post.update({
        where: { id: variant.postId },
        data: { status: 'published', publishedAt: new Date() },
      });
    }

    await this.audit.log({
      workspaceId: variant.socialAccount.workspaceId,
      userId: variant.post.createdBy,
      action: 'post.published',
      targetType: 'post_platform_variant',
      targetId: variant.id,
      meta: { platformPostId: result.platformPostId, platform: variant.platform },
    });
    await this.notifications.create({
      userId: variant.post.createdBy,
      workspaceId: variant.socialAccount.workspaceId,
      type: 'post.published',
      title: `Published to ${variant.platform}`,
      body: variant.contentText.slice(0, 120),
    });

    this.logger.log(`Published ${variant.platform} post ${result.platformPostId} (variant ${variant.id})`);
    return 'published';
  }

  async onFailed(job: Job<PublishJobData>, err: Error) {
    const { variantId } = job.data;
    try {
      const variant = await this.prisma.postPlatformVariant.findUnique({
        where: { id: variantId },
        include: { post: true },
      });
      if (!variant || variant.platformPostId) {
        return;
      }
      await this.prisma.postPlatformVariant.update({
        where: { id: variantId },
        data: {
          publishStatus: 'failed',
          errorMessage: err.message.slice(0, 1000),
        },
      });
      await this.audit.log({
        workspaceId: variant.post.workspaceId,
        userId: variant.post.createdBy,
        action: 'post.publish_failed',
        targetType: 'post_platform_variant',
        targetId: variant.id,
        meta: { error: err.message, attempts: job.attemptsMade },
      });
      await this.notifications.create({
        userId: variant.post.createdBy,
        workspaceId: variant.post.workspaceId,
        type: 'post.failed',
        title: `Publish failed: ${variant.platform}`,
        body: err.message.slice(0, 200),
      });
      this.logger.error(`Variant ${variantId} failed after ${job.attemptsMade} attempts: ${err.message}`);
    } catch (inner) {
      this.logger.error(`onFailed handler error for ${variantId}: ${inner instanceof Error ? inner.message : inner}`);
    }
  }
}

export { RateLimitedError };