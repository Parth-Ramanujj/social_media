import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PLATFORM_LIMITS } from '@pulse/shared-types';
import { Platform, PostStatus, PublishStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PublishingService } from '../publishing/publishing.service';
import { CreatePostDto, ImportPostItemDto, UpdatePostDto } from './dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publishing: PublishingService,
  ) {}

  async create(opts: { workspaceId: string; userId: string; dto: CreatePostDto }) {
    const { workspaceId, userId, dto } = opts;
    const accounts = await this.loadAccounts(workspaceId, dto.variants.map((v) => v.socialAccountId));

    const status: PostStatus = dto.status === 'scheduled' ? 'scheduled' : dto.status === 'queued' ? 'queued' : 'draft';
    if (status === 'queued' && dto.needsApproval === false) {
      throw new BadRequestException('queued posts require approval (needsApproval=true)');
    }
    if (status === 'scheduled') {
      for (const v of dto.variants) {
        if (!v.scheduledAt) {
          throw new BadRequestException('scheduled posts need a scheduledAt per variant');
        }
        if (new Date(v.scheduledAt).getTime() <= Date.now()) {
          throw new BadRequestException('scheduledAt must be in the future');
        }
      }
    }

    const post = await this.prisma.post.create({
      data: {
        workspaceId,
        createdBy: userId,
        status,
        title: dto.title ?? null,
        variants: {
          create: dto.variants.map((v) => {
            const account = accounts.get(v.socialAccountId)!;
            this.validateVariant(account.platform, v.contentText, v.mediaUrls ?? []);
            return {
              socialAccountId: account.id,
              platform: account.platform,
              contentText: v.contentText,
              mediaUrls: v.mediaUrls ?? [],
              scheduledAt: v.scheduledAt ? new Date(v.scheduledAt) : null,
              publishStatus: status === 'draft' ? 'pending' : status === 'queued' ? 'pending' : 'scheduled',
            };
          }),
        },
      },
      include: { variants: true },
    });

    if (status === 'scheduled') {
      for (const variant of post.variants) {
        await this.publishing.scheduleVariant(variant.id);
      }
    }

    await this.audit.log({
      workspaceId,
      userId,
      action: `post.${status}`,
      targetType: 'post',
      targetId: post.id,
      meta: { variantCount: post.variants.length, needsApproval: dto.needsApproval ?? false },
    });
    return post;
  }

  list(opts: { workspaceId: string; status?: string; from?: string; to?: string; limit: number; offset: number }) {
    const where: Record<string, unknown> = { workspaceId: opts.workspaceId };
    if (opts.status) where.status = opts.status;
    if (opts.from || opts.to) {
      where.scheduledAt = {};
      if (opts.from) (where.scheduledAt as any).gte = new Date(opts.from);
      if (opts.to) (where.scheduledAt as any).lte = new Date(opts.to);
    }
    return this.prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      skip: opts.offset,
      include: {
        variants: {
          include: { socialAccount: { select: { id: true, platform: true, displayName: true } } },
        },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async get(opts: { workspaceId: string; postId: string }) {
    const post = await this.prisma.post.findFirst({
      where: { id: opts.postId, workspaceId: opts.workspaceId },
      include: {
        variants: { include: { socialAccount: { select: { id: true, platform: true, displayName: true } } } },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });
    if (!post) {
      throw new NotFoundException('Post not found in this workspace');
    }
    return post;
  }

  /** Edits allowed only while the post is a draft, queued, or failed. */
  async update(opts: { workspaceId: string; userId: string; postId: string; dto: UpdatePostDto }) {
    const post = await this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
    if (!['draft', 'queued', 'failed', 'cancelled'].includes(post.status)) {
      throw new ForbiddenException('Only drafts, queued, failed or cancelled posts can be edited');
    }
    if (opts.dto.variants) {
      const variant = post.variants[0];
      const patch = opts.dto.variants[variant.id];
      if (patch) {
        await this.prisma.postPlatformVariant.update({
          where: { id: variant.id },
          data: {
            contentText: patch.contentText,
            mediaUrls: patch.mediaUrls,
            scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : undefined,
          },
        });
      }
    }
    const updated = await this.prisma.post.update({
      where: { id: post.id },
      data: { title: opts.dto.title ?? undefined },
      include: { variants: true },
    });
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'post.updated',
      targetType: 'post',
      targetId: post.id,
    });
    return updated;
  }

  async remove(opts: { workspaceId: string; userId: string; postId: string }) {
    const post = await this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
    if (!['draft', 'queued', 'failed', 'cancelled'].includes(post.status)) {
      throw new ConflictException('Only drafts, queued, failed or cancelled posts can be deleted');
    }
    await this.prisma.post.delete({ where: { id: post.id } });
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'post.deleted',
      targetType: 'post',
      targetId: post.id,
    });
  }

  /** Editor submits -> admin approves -> variants get enqueued. */
  async approve(opts: { workspaceId: string; userId: string; postId: string }) {
    const post = await this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
    if (post.status !== 'queued') {
      throw new ConflictException('Only queued posts can be approved');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: post.id },
        data: { status: 'scheduled' },
      });
      await tx.postPlatformVariant.updateMany({
        where: { postId: post.id, publishStatus: 'pending' },
        data: { publishStatus: 'scheduled' },
      });
    });
    for (const variant of post.variants) {
      await this.publishing.scheduleVariant(variant.id);
    }
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'post.approved',
      targetType: 'post',
      targetId: post.id,
    });
    return this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
  }

  /** Publish immediately regardless of schedule. */
  async publishNow(opts: { workspaceId: string; userId: string; postId: string }) {
    const post = await this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
    if (!['draft', 'queued', 'scheduled', 'failed', 'cancelled'].includes(post.status)) {
      throw new ConflictException(`Cannot publish a post in status ${post.status}`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: post.id }, data: { status: 'scheduled' } });
      await tx.postPlatformVariant.updateMany({
        where: { postId: post.id, publishStatus: { in: ['pending', 'scheduled', 'failed'] } },
        data: { publishStatus: 'scheduled', scheduledAt: new Date() },
      });
    });
    const fresh = await this.get({ workspaceId: opts.workspaceId, postId: opts.postId });
    for (const variant of fresh.variants) {
      await this.publishing.publishNow(variant.id);
    }
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'post.publish_now',
      targetType: 'post',
      targetId: post.id,
    });
    return fresh;
  }

  /** Bulk import (CSV converted to JSON by the client, or direct JSON array). */
  async importBulk(opts: { workspaceId: string; userId: string; items: ImportPostItemDto[] }) {
    const results: { created: number; posts: unknown[] } = { created: 0, posts: [] };
    for (const item of opts.items) {
      const created = await this.create({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        dto: {
          variants: [item],
          status: item.scheduledAt ? 'scheduled' : 'draft',
          needsApproval: item.needsApproval,
        },
      });
      results.created++;
      results.posts.push(created);
    }
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'post.bulk_import',
      targetType: 'post',
      meta: { count: results.created },
    });
    return results;
  }

  private validateVariant(platform: Platform, text: string, mediaUrls: string[]) {
    const limits = PLATFORM_LIMITS[platform];
    if (text.length > limits.text) {
      throw new BadRequestException(
        `${platform} allows max ${limits.text} characters (got ${text.length})`,
      );
    }
    if (mediaUrls.length > limits.maxMedia) {
      throw new BadRequestException(`${platform} allows max ${limits.maxMedia} media items`);
    }
  }

  private async loadAccounts(workspaceId: string, ids: string[]) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of ids) {
      const account = byId.get(id);
      if (!account) {
        throw new NotFoundException(`Social account ${id} not found`);
      }
      if (account.workspaceId !== workspaceId) {
        throw new ForbiddenException(`Social account ${id} belongs to another workspace`);
      }
    }
    return byId;
  }
}