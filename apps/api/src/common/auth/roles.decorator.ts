import { SetMetadata } from '@nestjs/common';
import { Role } from '@pulse/shared-types';

export const ROLES_KEY = 'required_roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);