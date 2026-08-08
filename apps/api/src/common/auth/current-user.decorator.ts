import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import type { Role } from '@pulse/shared-types';
import type { User } from '@prisma/client';

export interface WorkspaceMembership {
  workspaceId: string;
  role: Role;
}

/**
 * The authenticated actor. Valid only on routes behind JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as User;
});

/**
 * Resolved membership for the route's workspace. Valid only behind
 * JwtAuthGuard + WorkspaceScopeGuard.
 */
export const Membership = createParamDecorator((_data: unknown, ctx: ExecutionContext): WorkspaceMembership => {
  const req = ctx.switchToHttp().getRequest();
  return req.membership as WorkspaceMembership;
});

/**
 * The workspace row attached by WorkspaceScopeGuard.
 */
export const CurrentWorkspace = createParamDecorator((_data: unknown, ctx: ExecutionContext): Workspace => {
  const req = ctx.switchToHttp().getRequest();
  return req.workspace as Workspace;
});