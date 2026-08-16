import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeQueryDto, MockAnalyticsQueryDto } from './dto';

@Controller('workspaces/:workspaceId/analytics')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
@WorkspaceScoped()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@Param('workspaceId') workspaceId: string, @Query() query: AnalyticsRangeQueryDto) {
    return this.analytics.summary({ workspaceId, days: query.days ?? 30 });
  }

  @Get('export')
  async export(@Param('workspaceId') workspaceId: string, @Query() query: AnalyticsRangeQueryDto) {
    return this.analytics.csv({ workspaceId, days: query.days ?? 30 });
  }

  @Post('mock')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  mock(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Query() query: MockAnalyticsQueryDto,
  ) {
    return this.analytics.mock({ workspaceId, userId: user.id, query });
  }
}
