import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Role } from '@pulse/shared-types';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser, Membership } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { MemberIdParamsDto, UpdateMemberRoleDto } from './dto';
import { MembersService } from './members.service';

@Controller('workspaces/:workspaceId/members')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
@WorkspaceScoped()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.members.list(workspaceId);
  }

  @Patch(':userId')
  @Roles('owner', 'admin')
  changeRole(
    @CurrentUser() user: User,
    @Membership() membership: { workspaceId: string; role: Role },
    @Param('workspaceId') workspaceId: string,
    @Param() params: MemberIdParamsDto,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.changeRole({
      workspaceId,
      actorId: user.id,
      actorRole: membership.role,
      targetUserId: params.userId,
      newRole: dto.role,
    });
  }

  @Delete(':userId')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Membership() membership: { workspaceId: string; role: Role },
    @Param('workspaceId') workspaceId: string,
    @Param() params: MemberIdParamsDto,
  ) {
    await this.members.remove({
      workspaceId,
      actorId: user.id,
      actorRole: membership.role,
      targetUserId: params.userId,
    });
  }
}