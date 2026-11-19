import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsRepository } from './repositories/posts.repository';
import { UsersModule } from '../users/users.module';
import { MentionsModule } from '../mentions/mentions.module';

@Module({
  imports: [UsersModule, MentionsModule],
  controllers: [PostsController],
  providers: [PostsService, PostsRepository],
  exports: [PostsService],
})
export class PostsModule {}
