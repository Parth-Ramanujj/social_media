import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User, Workspace } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser, CurrentWorkspace } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.workspaces.listForUser(user.id);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  get(@CurrentWorkspace() workspace: Workspace) {
    return workspace;
  }

  @Get(':workspaceId/audit')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  auditLog(@Param('workspaceId') workspaceId: string, @Query('limit') limit?: string) {
    return this.audit.listForWorkspace(workspaceId, Math.min(Number(limit) || 100, 500));
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  update(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(workspaceId, user.id, dto);
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: User, @Param('workspaceId') workspaceId: string) {
    await this.workspaces.remove(workspaceId, user.id);
  }
}