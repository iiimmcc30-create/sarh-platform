import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [UsersModule, PostsModule, ListingsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
