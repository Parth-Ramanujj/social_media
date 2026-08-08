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
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { WorkspaceScopeGuard } from '../common/workspaces/workspace-scope.guard';
import { WorkspaceScoped } from '../common/workspaces/workspace-scoped.decorator';
import { CreatePostDto, ImportPostItemDto, ListPostsQueryDto, UpdatePostDto } from './dto';
import { PostsService } from './posts.service';

@Controller('workspaces/:workspaceId/posts')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard, RolesGuard)
@WorkspaceScoped()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @Query() query: ListPostsQueryDto) {
    return this.posts.list({
      workspaceId,
      status: query.status,
      from: query.from,
      to: query.to,
      limit: Math.min(query.limit ?? 50, 200),
      offset: query.offset ?? 0,
    });
  }

  @Get(':postId')
  get(@Param('workspaceId') workspaceId: string, @Param('postId') postId: string) {
    return this.posts.get({ workspaceId, postId });
  }

  @Post()
  @Roles('owner', 'admin', 'editor')
  create(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create({ workspaceId, userId: user.id, dto });
  }

  @Post('import')
  @Roles('owner', 'admin', 'editor')
  importBulk(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Body() items: ImportPostItemDto[],
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      return { created: 0, posts: [] };
    }
    return this.posts.importBulk({ workspaceId, userId: user.id, items: items.slice(0, 200) });
  }

  @Patch(':postId')
  @Roles('owner', 'admin', 'editor')
  update(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update({ workspaceId, userId: user.id, postId, dto });
  }

  @Delete(':postId')
  @Roles('owner', 'admin', 'editor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
  ) {
    await this.posts.remove({ workspaceId, userId: user.id, postId });
  }

  @Post(':postId/approve')
  @Roles('owner', 'admin')
  approve(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
  ) {
    return this.posts.approve({ workspaceId, userId: user.id, postId });
  }

  @Post(':postId/publish-now')
  @Roles('owner', 'admin', 'editor')
  publishNow(
    @CurrentUser() user: User,
    @Param('workspaceId') workspaceId: string,
    @Param('postId') postId: string,
  ) {
    return this.posts.publishNow({ workspaceId, userId: user.id, postId });
  }
}