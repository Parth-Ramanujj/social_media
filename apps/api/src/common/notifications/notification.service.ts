import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';
import { Notification as NotificationModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationStreamEvent {
  kind: 'notification.created' | 'notifications.updated';
  notification?: NotificationModel;
}

type Listener = (event: NotificationStreamEvent) => void;

/**
 * Notification persistence + a per-user event stream (consumed by the SSE
 * endpoint, so the bell updates instantly instead of polling).
 */
@Injectable()
export class NotificationService {
  private readonly emitter = new EventEmitter();

  constructor(private readonly prisma: PrismaService) {
    // Many tabs/users can hold SSE connections to the same service instance.
    this.emitter.setMaxListeners(0);
  }

  private key(userId: string): string {
    return `user:${userId}`;
  }

  /** Subscribe to a user's notification events. Returns an unsubscribe fn. */
  subscribe(userId: string, listener: Listener): () => void {
    this.emitter.on(this.key(userId), listener);
    return () => this.emitter.off(this.key(userId), listener);
  }

  private emit(userId: string, event: NotificationStreamEvent) {
    this.emitter.emit(this.key(userId), event);
  }

  async create(opts: {
    userId: string;
    workspaceId?: string;
    type: string;
    title: string;
    body?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: opts.userId,
        workspaceId: opts.workspaceId ?? null,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
      },
    });
    this.emit(opts.userId, { kind: 'notification.created', notification });
    return notification;
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
    for (const m of members) {
      this.emit(m.userId, { kind: 'notification.created' });
    }
  }

  /** Like notifyWorkspace, but skips one member (e.g. the actor themselves). */
  async notifyWorkspaceExcept(opts: {
    workspaceId: string;
    exceptUserId: string;
    type: string;
    title: string;
    body?: string;
  }) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: opts.workspaceId },
      select: { userId: true },
    });
    const targets = members.filter((m) => m.userId !== opts.exceptUserId);
    if (targets.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: targets.map((m) => ({
        userId: m.userId,
        workspaceId: opts.workspaceId,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
      })),
    });
    for (const m of targets) {
      this.emit(m.userId, { kind: 'notification.created' });
    }
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

  async markRead(userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    this.emit(userId, { kind: 'notifications.updated' });
    return res;
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    this.emit(userId, { kind: 'notifications.updated' });
    return res;
  }
}
