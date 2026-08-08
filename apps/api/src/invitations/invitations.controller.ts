import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { AcceptInvitationDto, CreateInvitationDto } from './dto';
import { InvitationsService } from './invitations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('workspaces/:workspaceId/invitations')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  create(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create({
      workspaceId,
      invitedBy: { id: user.id, name: user.name, email: user.email },
      email: dto.email,
      role: dto.role,
    });
  }

  @Get('workspaces/:workspaceId/invitations')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  list(@Param('workspaceId') workspaceId: string) {
    return this.invitations.list(workspaceId);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.invitations.revoke({ workspaceId, actorId: user.id, invitationId });
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: User, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept({ rawToken: dto.token, userId: user.id, email: user.email });
  }
}