import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { name: dto.name, plan: dto.plan ?? 'free' },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: created.id, userId, role: 'owner' },
      });
      return created;
    });
    await this.audit.log({
      workspaceId: workspace.id,
      userId,
      action: 'workspace.created',
      targetType: 'workspace',
      targetId: workspace.id,
    });
    return workspace;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { workspace: true },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: dto.name },
    });
    await this.audit.log({
      workspaceId,
      userId,
      action: 'workspace.updated',
      targetType: 'workspace',
      targetId: workspaceId,
      meta: { name: dto.name },
    });
    return workspace;
  }

  async remove(workspaceId: string, userId: string) {
    const members = await this.prisma.workspaceMember.count({ where: { workspaceId } });
    if (members > 1) {
      throw new NotFoundException('Remove all members before deleting the workspace');
    }
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany({ where: { workspaceId } }),
      this.prisma.workspace.delete({ where: { id: workspaceId } }),
    ]);
    void userId;
  }
}