import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { WORKSPACE_PARAM_KEY } from './workspace-scoped.decorator';

/**
 * Enforces per-workspace data isolation: the workspace id is taken from the
 * ROUTE param (never trusted from the client body), a membership row is looked
 * up for (user, workspace), and both are attached to the request.
 *
 * Must run after JwtAuthGuard (req.user) and before RolesGuard.
 */
@Injectable()
export class WorkspaceScopeGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const paramName = this.reflector.getAllAndOverride<string | undefined>(
      WORKSPACE_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!paramName) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const workspaceId: string | undefined = req.params?.[paramName];
    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
      select: {
        role: true,
        workspace: {
          select: { id: true, name: true, plan: true, createdAt: true },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    req.membership = { workspaceId, role: membership.role };
    req.workspace = membership.workspace;
    return true;
  }
}