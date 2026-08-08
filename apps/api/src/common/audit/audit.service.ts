import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  workspaceId: string;
  userId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry) {
    return this.prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        meta: entry.meta ? (entry.meta as Prisma.InputJsonObject) : undefined,
      },
    });
  }

  async listForWorkspace(workspaceId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }
}