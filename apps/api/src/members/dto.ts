import { IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '@pulse/shared-types';

export class UpdateMemberRoleDto {
  @IsIn(['owner', 'admin', 'editor', 'viewer'])
  role: Role;
}

export class MemberIdParamsDto {
  @IsString()
  @MinLength(1)
  userId: string;
}