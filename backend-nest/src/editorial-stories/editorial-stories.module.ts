import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminEditorialStoriesController } from './admin-editorial-stories.controller';
import { EditorialStoriesController } from './editorial-stories.controller';
import { EditorialStoriesService } from './editorial-stories.service';
import { EditorialStoriesRepository } from './repositories/editorial-stories.repository';

@Module({
  imports: [PrismaModule],
  controllers: [EditorialStoriesController, AdminEditorialStoriesController],
  providers: [EditorialStoriesService, EditorialStoriesRepository],
  exports: [EditorialStoriesService],
})
export class EditorialStoriesModule {}
