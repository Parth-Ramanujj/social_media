import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InboxMessageType, InboxMessageStatus, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationService } from '../common/notifications/notification.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProviderRegistry } from '../oauth/provider-registry.service';
import { SocialAccountRef } from '../oauth/social-provider.interface';
import { ListInboxQueryDto, MockInboxQueryDto, ReplyInboxDto, UpdateInboxDto } from './dto';

const MOCK_AUTHORS = ['Priya Shah', 'Marco Diaz', 'Jenna Liu', 'Tom Beckett', 'Aisha Khan', 'Leo Martins'];
const MOCK_COMMENTS = [
  'This is exactly what we needed, thanks for sharing!',
  'Love the way this is framed — shipping it to the team.',
  'Can you make a video walkthrough of this?',
  'Been waiting for something like this for months.',
  'Great read. The scheduling section is spot on.',
  'How does this compare to your earlier release?',
  'Just tested it — the publish flow is buttery.',
  'Any plans for an API access tier?',
];
const MOCK_DMS = [
  'Hey — quick question about onboarding a second workspace.',
  'Would you be open to a partnership on the launch?',
  'We hit a snag syncing accounts, can you check?',
  'Your team account got flagged by our security review, please respond.',
];

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly registry: ProviderRegistry,
    private readonly encryption: EncryptionService,
  ) {}

  private baseWhere(workspaceId: string, query: ListInboxQueryDto) {
    const where: Prisma.InboxWhereInput = {
      socialAccount: { workspaceId },
    };
    if (query.type) where.type = query.type as InboxMessageType;
    if (query.status) where.status = query.status as InboxMessageStatus;
    if (query.accountId) where.socialAccountId = query.accountId;
    return where;
  }

  async list(opts: { workspaceId: string; query: ListInboxQueryDto }) {
    const { workspaceId, query } = opts;
    const where = this.baseWhere(workspaceId, query);
    const [items, total, counts] = await Promise.all([
      this.prisma.inbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(query.limit ?? 50, 200),
        skip: query.offset ?? 0,
        include: {
          socialAccount: { select: { id: true, platform: true, displayName: true } },
          assignee: { select: { id: true, name: true, email: true } },
          replies: {
            include: { repliedByUser: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.inbox.count({ where }),
      this.prisma.inbox.groupBy({
        by: ['status'],
        where: { socialAccount: { workspaceId } },
        _count: { _all: true },
      }),
    ]);
    const byStatus: Record<string, number> = {
      unassigned: 0,
      assigned: 0,
      resolved: 0,
    };
    for (const row of counts) byStatus[row.status] = row._count._all;
    return { items, total, counts: byStatus };
  }

  async get(opts: { workspaceId: string; messageId: string }) {
    const message = await this.prisma.inbox.findFirst({
      where: { id: opts.messageId, socialAccount: { workspaceId: opts.workspaceId } },
      include: {
        socialAccount: { select: { id: true, platform: true, displayName: true } },
        assignee: { select: { id: true, name: true, email: true } },
        replies: {
          include: { repliedByUser: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!message) {
      throw new NotFoundException('Inbox message not found in this workspace');
    }
    return message;
  }

  /** Assign/unassign or resolve/reopen a message. */
  async update(opts: {
    workspaceId: string;
    userId: string;
    messageId: string;
    dto: UpdateInboxDto;
  }) {
    const message = await this.get({ workspaceId: opts.workspaceId, messageId: opts.messageId });
    const current = message.status;

    if (opts.dto.assignedTo !== undefined) {
      if (opts.dto.assignedTo !== null) {
        const member = await this.prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: opts.workspaceId, userId: opts.dto.assignedTo },
          },
        });
        if (!member) {
          throw new BadRequestException('assignedTo must be a member of this workspace');
        }
      }
      await this.prisma.inbox.update({
        where: { id: message.id },
        data: { assignedTo: opts.dto.assignedTo },
      });
    }

    if (opts.dto.status) {
      const target = opts.dto.status as InboxMessageStatus;
      if (target === 'resolved' && current === 'resolved') {
        throw new ConflictException('Message is already resolved');
      }
      await this.prisma.inbox.update({
        where: { id: message.id },
        data: { status: target },
      });
    }

    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: `inbox.${opts.dto.status ?? 'updated'}`,
      targetType: 'inbox',
      targetId: message.id,
      meta: {
        status: opts.dto.status ?? message.status,
        assignedTo: opts.dto.assignedTo ?? message.assignedTo,
      },
    });
    return this.get({ workspaceId: opts.workspaceId, messageId: opts.messageId });
  }

  /** Send a reply (dry-run: stored locally, reply "delivered" back to the platform). */
  async reply(opts: {
    workspaceId: string;
    userId: string;
    messageId: string;
    dto: ReplyInboxDto;
  }) {
    const message = await this.get({ workspaceId: opts.workspaceId, messageId: opts.messageId });
    if (message.status === 'resolved') {
      throw new ConflictException('Cannot reply to a resolved message');
    }

    // Call the external provider if this is a real message (not a dry-run mock).
    // Provider failures (bad token, messaging policy, etc.) surface as 400s
    // with the platform's reason — never a silent 500.
    if (!message.externalMessageId.startsWith('dry-run:')) {
      const account = await this.prisma.socialAccount.findUnique({
        where: { id: message.socialAccountId },
      });
      if (!account) throw new NotFoundException('Account not found');

      const provider = this.registry.get(account.platform);
      if (provider.enabled) {
        const ref: SocialAccountRef = {
          id: account.id,
          workspaceId: account.workspaceId,
          platform: account.platform,
          externalAccountId: account.externalAccountId,
          displayName: account.displayName,
          accessToken: this.encryption.decrypt(account.accessTokenEncrypted),
          refreshToken: account.refreshTokenEncrypted
            ? this.encryption.decrypt(account.refreshTokenEncrypted)
            : null,
          tokenExpiresAt: account.tokenExpiresAt,
          metadata: (account.metadata ?? {}) as Record<string, unknown>,
        };
        try {
          await provider.reply(ref, message.externalMessageId, opts.dto.content, {
            metadata: (message.metadata ?? undefined) as Record<string, unknown> | undefined,
          });
        } catch (e) {
          throw new BadRequestException(
            `Platform rejected the reply: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    const reply = await this.prisma.inboxReply.create({
      data: {
        inboxId: message.id,
        content: opts.dto.content,
        repliedBy: opts.userId,
      },
    });
    await this.prisma.inbox.update({
      where: { id: message.id },
      data: { repliedAt: new Date() },
    });
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      action: 'inbox.replied',
      targetType: 'inbox',
      targetId: message.id,
    });
    return reply;
  }

  /**
   * Dry-run demo data: fabricates realistic comments/DMs against the workspace's
   * connected accounts so the inbox is testable without platform webhooks.
   */
  async mock(opts: { workspaceId: string; userId: string; query: MockInboxQueryDto }) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId: opts.workspaceId, status: { not: 'disconnected' } },
      select: { id: true, platform: true },
    });
    if (accounts.length === 0) {
      throw new BadRequestException('Connect a social account first (dry-run meta works)');
    }
    const target = accounts.find((a) => a.id === opts.query.accountId) ?? accounts[0];
    const count = Math.min(opts.query.count ?? 8, 40);
    const since = opts.query.since ? new Date(opts.query.since) : new Date(Date.now() - 7 * 86400_000);
    const now = Date.now();
    const span = now - since.getTime();

    const rows = Array.from({ length: count }, (_, i) => {
      const isDm = i % 4 === 0;
      const createdAt = new Date(since.getTime() + (span / count) * i);
      const externalId = `dry-run:inbox:${target.id}:${Date.now()}:${i}`;
      return {
        socialAccountId: target.id,
        platform: target.platform,
        externalMessageId: externalId,
        type: (isDm ? 'dm' : 'comment') as InboxMessageType,
        senderName: MOCK_AUTHORS[i % MOCK_AUTHORS.length],
        content: (isDm ? MOCK_DMS : MOCK_COMMENTS)[(i * 7) % (isDm ? MOCK_DMS : MOCK_COMMENTS).length],
        status: 'unassigned' as InboxMessageStatus,
        createdAt,
      };
    });

    const created = await this.prisma.inbox.createMany({
      data: rows,
      skipDuplicates: true,
    });

    if (created.count > 0) {
      await this.notifications.create({
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        type: 'inbox.new',
        title: `${created.count} new inbox messages`,
        body: `Mocked messages for ${target.platform} in the demo inbox.`,
      });
      await this.audit.log({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        action: 'inbox.mock',
        targetType: 'inbox',
        meta: { count: created.count, accountId: target.id },
      });
    }
    return { created: created.count, accountId: target.id };
  }

  /**
   * Pull real comments/DMs from every connected account since the last 7 days
   * and upsert them by (platform, externalMessageId). Per-account failures
   * (bad token, platform down) are reported, not fatal.
   */
  async sync(opts: { workspaceId: string; userId: string }) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId: opts.workspaceId, status: { not: 'disconnected' } },
    });
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    const errors: Array<{ accountId: string; platform: string; message: string }> = [];
    let fetched = 0;
    // Provider rows are never `dry-run:` prefixed; mock rows are. Count the
    // diff so "created" reflects rows this sync actually inserted via upsert.
    const realWhere = {
      socialAccount: { workspaceId: opts.workspaceId },
      externalMessageId: { not: { startsWith: 'dry-run:' } },
    };
    const before = await this.prisma.inbox.count({ where: realWhere });

    for (const account of accounts) {
      try {
        const provider = this.registry.get(account.platform);
        if (!provider.enabled) {
          continue;
        }
        const ref: SocialAccountRef = {
          id: account.id,
          workspaceId: account.workspaceId,
          platform: account.platform,
          externalAccountId: account.externalAccountId,
          displayName: account.displayName,
          accessToken: this.encryption.decrypt(account.accessTokenEncrypted),
          refreshToken: account.refreshTokenEncrypted
            ? this.encryption.decrypt(account.refreshTokenEncrypted)
            : null,
          tokenExpiresAt: account.tokenExpiresAt,
          metadata: (account.metadata ?? {}) as Record<string, unknown>,
        };

        const items = await provider.fetchInbox(ref, since);
        for (const item of items) {
          await this.prisma.inbox.upsert({
            where: {
              platform_externalMessageId: {
                platform: account.platform,
                externalMessageId: item.externalMessageId,
              },
            },
            create: {
              socialAccountId: account.id,
              platform: account.platform,
              externalMessageId: item.externalMessageId,
              type: item.type as InboxMessageType,
              senderName: item.senderName,
              content: item.content,
              createdAt: item.createdAt,
            },
            update: {},
          });
          fetched += 1;
        }
      } catch (e) {
        errors.push({
          accountId: account.id,
          platform: account.platform,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const after = await this.prisma.inbox.count({ where: realWhere });
    const created = after - before;

    if (created > 0) {
      await this.notifications.create({
        userId: opts.userId,
        workspaceId: opts.workspaceId,
        type: 'inbox.new',
        title: `${created} new inbox message${created === 1 ? '' : 's'}`,
        body: 'Synced from your connected social accounts.',
      });
      await this.audit.log({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        action: 'inbox.sync',
        targetType: 'inbox',
        meta: { fetched, created, errors: errors.length },
      });
    }

    return { accounts: accounts.length, fetched, created, errors };
  }

  /** No rows for this workspace at all (UI shows the "generate demo data" state). */
  async isEmpty(workspaceId: string) {
    return (await this.prisma.inbox.count({ where: { socialAccount: { workspaceId } } })) === 0;
  }
}
