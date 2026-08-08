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
  }

  async scheduleVariant(variantId: string) {
    const variant = await this.prisma.postPlatformVariant.findUnique({ where: { id: variantId } });
    if (!variant) {
      throw new Error(`Variant ${variantId} not found`);
    }
    const delay = Math.max(0, (variant.scheduledAt?.getTime() ?? Date.now()) - Date.now());
    await this.publishQueue.add('publish', { variantId }, this.jobOptions(variantId, delay));
  }

  async publishNow(variantId: string) {
    await this.publishQueue.add('publish', { variantId }, this.jobOptions(variantId, 0));
  }

  private jobOptions(variantId: string, delay: number) {
    return {
      jobId: `pub_${variantId}`, // idempotency: same variant => same job id (no ':' allowed)
      delay,
      attempts: 4, // initial + 3 retries
      backoff: { type: 'exponential' as const, delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: false,
    };
  }
}