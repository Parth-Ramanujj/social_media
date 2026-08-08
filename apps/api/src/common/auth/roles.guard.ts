import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@pulse/shared-types';
import { ROLES_KEY } from './roles.decorator';

/**
 * Checks the actor's membership role (attached by WorkspaceScopeGuard) against
 * the roles required by the @Roles() decorator. Must run AFTER WorkspaceScopeGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const role: Role | undefined = req.membership?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException(`Requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}