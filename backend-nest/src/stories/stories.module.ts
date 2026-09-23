import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { StoriesRepository } from './repositories/stories.repository';
import { StoryViewRepository } from './repositories/story-view.repository';
import { StoryReactionRepository } from './repositories/story-reaction.repository';

@Module({
  imports: [MessagesModule],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    StoriesRepository,
    StoryViewRepository,
    StoryReactionRepository,
  ],
  exports: [StoriesService],
})
export class StoriesModule {}
