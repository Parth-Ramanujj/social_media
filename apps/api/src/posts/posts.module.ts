import { Module } from '@nestjs/common';
import { PublishingModule } from '../publishing/publishing.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [PublishingModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
