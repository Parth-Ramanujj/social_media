import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  create(opts: {
    userId: string;
    workspaceId?: string;
    type: string;
    title: string;
    body?: string;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: opts.userId,
        workspaceId: opts.workspaceId ?? null,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
      },
    });
  }

  /** Notify every member of a workspace (used by background jobs with no single actor). */
  async notifyWorkspace(opts: {
    workspaceId: string;
    type: string;
    title: string;
    body?: string;
  }) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: opts.workspaceId },
      select: { userId: true },
    });
    if (members.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        workspaceId: opts.workspaceId,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
      })),
    });
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }
}