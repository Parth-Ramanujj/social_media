import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@pulse/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Role rules:
   * - owner and admin can change roles
   * - only an owner may grant/revoke the owner role
   * - you cannot change your own role (avoids owner lockout / self-escalation)
   */
  async changeRole(opts: {
    workspaceId: string;
    actorId: string;
    actorRole: Role;
    targetUserId: string;
    newRole: Role;
  }) {
    const { workspaceId, actorId, actorRole, targetUserId, newRole } = opts;
    if (actorId === targetUserId) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (actorRole === 'owner' && newRole === 'owner') {
      // transfer ownership is out of scope for now
      throw new BadRequestException('Ownership transfer is not supported');
    }

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) {
      throw new NotFoundException('Member not found in this workspace');
    }

    if (newRole === 'owner' || target.role === 'owner') {
      if (actorRole !== 'owner') {
        throw new ForbiddenException('Only the owner can manage the owner role');
      }
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: newRole },
    });
    await this.audit.log({
      workspaceId,
      userId: actorId,
      action: 'member.role_changed',
      targetType: 'workspace_member',
      targetId: target.id,
      meta: { userId: targetUserId, from: target.role, to: newRole },
    });
    return updated;
  }

  async remove(opts: {
    workspaceId: string;
    actorId: string;
    actorRole: Role;
    targetUserId: string;
  }) {
    const { workspaceId, actorId, actorRole, targetUserId } = opts;
    if (actorId === targetUserId) {
      throw new BadRequestException('You cannot remove yourself');
    }
    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) {
      throw new NotFoundException('Member not found in this workspace');
    }
    if (target.role === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only the owner can remove another owner');
    }
    await this.prisma.workspaceMember.delete({ where: { id: target.id } });
    await this.audit.log({
      workspaceId,
      userId: actorId,
      action: 'member.removed',
      targetType: 'workspace_member',
      targetId: target.id,
      meta: { userId: targetUserId },
    });
  }
}