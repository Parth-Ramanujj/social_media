import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Enqueues publish jobs. Idempotency: the BullMQ jobId is `pub_<variantId>`
 * (BullMQ forbids ':' in custom ids), so a job can never be enqueued twice.
 */
@Injectable()
export class PublishingService implements OnModuleInit {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    @InjectQueue('publish') private readonly publishQueue: Queue,
    @InjectQueue('refresh-tokens') private readonly refreshQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Hourly token-refresh sweep (repeatable scheduler, BullMQ v5 API).
    await this.refreshQueue.upsertJobScheduler(
      'token-refresh-hourly',
      { every: 60 * 60 * 1000 },
      { name: 'refresh-tokens', data: {} },
    );
    this.logger.log('Token refresh scheduler installed (hourly)');
    await this.recoverStalePublishing();
  }

  /**
   * Crash recovery: any variant stuck in `publishing` for > 15 min means a
   * previous job died mid-flight and no worker is (or will be) retrying it.
   * Reset it to `scheduled` and re-enqueue so the publish actually happens.
   */
  private async recoverStalePublishing() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const stale = await this.prisma.postPlatformVariant.findMany({
      where: {
        publishStatus: 'publishing',
        updatedAt: { lt: cutoff },
        platformPostId: null,
      },
    });
    if (stale.length === 0) return;
    await this.prisma.postPlatformVariant.updateMany({
      where: { id: { in: stale.map((v) => v.id) } },
      data: { publishStatus: 'scheduled', errorMessage: null },
    });
    for (const variant of stale) {
      await this.scheduleVariant(variant.id);
      this.logger.warn(
        `Recovered stuck 'publishing' variant ${variant.id} -> scheduled + requeued`,
      );
    }
  }

  async scheduleVariant(variantId: string) {
    const variant = await this.prisma.postPlatformVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }
    // Clear any previous (failed/delayed) job with the same id — BullMQ
    // silently dedupes on add(), which would make retries no-ops forever.
    await this.publishQueue.remove(this.jobId(variantId));
    const delay = Math.max(0, (variant.scheduledAt?.getTime() ?? Date.now()) - Date.now());
    await this.publishQueue.add('publish', { variantId }, this.jobOptions(variantId, delay));
  }

  async publishNow(variantId: string) {
    await this.publishQueue.remove(this.jobId(variantId));
    await this.publishQueue.add('publish', { variantId }, this.jobOptions(variantId, 0));
  }

  private jobId(variantId: string) {
    return `pub_${variantId}`; // BullMQ forbids ':' in custom ids
  }

  private jobOptions(variantId: string, delay: number) {
    return {
      jobId: this.jobId(variantId), // idempotency: same variant => same job id (no ':' allowed)
      delay,
      attempts: 4, // initial + 3 retries
      backoff: { type: 'exponential' as const, delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: false,
    };
  }
}