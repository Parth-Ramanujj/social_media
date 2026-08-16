import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { ListInboxQueryDto, MockInboxQueryDto, ReplyInboxDto, UpdateInboxDto } from './dto';
import { InboxService } from './inbox.service';

@Controller('workspaces/:workspaceId/inbox')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
@WorkspaceScoped()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @Query() query: ListInboxQueryDto) {
    return this.inbox.list({ workspaceId, query });
  }

  @Get('empty')
  isEmpty(@Param('workspaceId') workspaceId: string) {
    return this.inbox.isEmpty(workspaceId);
  }

  @Get(':messageId')
  get(@Param('workspaceId') workspaceId: string, @Param('messageId') messageId: string) {
    return this.inbox.get({ workspaceId, messageId });
  }

  @Patch(':messageId')
  @Roles('owner', 'admin', 'editor')
  update(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateInboxDto,
  ) {
    return this.inbox.update({ workspaceId, userId: user.id, messageId, dto });
  }

  @Post(':messageId/reply')
  @Roles('owner', 'admin', 'editor')
  reply(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ReplyInboxDto,
  ) {
    return this.inbox.reply({ workspaceId, userId: user.id, messageId, dto });
  }

  @Post('sync')
  @Roles('owner', 'admin', 'editor')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: User, @Param('workspaceId') workspaceId: string) {
    return this.inbox.sync({ workspaceId, userId: user.id });
  }

  @Post('mock')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  mock(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Query() query: MockInboxQueryDto,
  ) {
    return this.inbox.mock({ workspaceId, userId: user.id, query });
  }
}
