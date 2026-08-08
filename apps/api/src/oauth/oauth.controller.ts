import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PLATFORMS, Platform } from '@pulse/shared-types';
import { IsIn } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { OauthService } from './oauth.service';

export class PlatformParamDto {
  @IsIn(PLATFORMS)
  platform: Platform;
}

@Controller()
export class OauthController {
  constructor(
    private readonly oauth: OauthService,
    private readonly config: ConfigService,
  ) {}

  /** Step 1: kick off OAuth for a platform (editor+). */
  @Get('workspaces/:workspaceId/oauth/connect/:platform')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin', 'editor')
  startConnect(@CurrentUser() user: any, @Param() params: PlatformParamDto, @Param('workspaceId') workspaceId: string) {
    return this.oauth.startConnect({ platform: params.platform, workspaceId, user });
  }

  /** Step 2: provider callback — public; state + code are validated. */
  @Get('oauth/callback/:platform')
  @Redirect()
  async callback(
    @Param() params: PlatformParamDto,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      await this.oauth.handleCallback({ platform: params.platform, code, state });
      res.status(302);
      return { url: `${this.config.get<string>('frontendUrl')}/settings/accounts?connected=${params.platform}` };
    } catch {
      res.status(302);
      return { url: `${this.config.get<string>('frontendUrl')}/settings/accounts?error=connect_failed` };
    }
  }

  @Get('workspaces/:workspaceId/accounts')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  list(@Param('workspaceId') workspaceId: string) {
    return this.oauth.listAccounts(workspaceId);
  }

  @Post('workspaces/:workspaceId/accounts/:accountId/refresh')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  refresh(@Param('workspaceId') workspaceId: string, @Param('accountId') accountId: string) {
    return this.oauth.refreshAccount({ workspaceId, accountId });
  }

  @Delete('workspaces/:workspaceId/accounts/:accountId')
  @UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
  @WorkspaceScoped()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: any, @Param('workspaceId') workspaceId: string, @Param('accountId') accountId: string) {
    await this.oauth.disconnect({ workspaceId, accountId, actorId: user.id });
  }
}