import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { CommonModule } from '../common/common.module';
import { AdminKnowledgeController } from './admin-knowledge.controller';
import { KnowledgeRepository } from './repositories/knowledge.repository';
import { KnowledgeCenterService } from './services/knowledge-center.service';
import { NewsFetcherService } from './services/news-fetcher.service';
import { AISummarizerService } from './services/ai-summarizer.service';
import { PublisherService } from './services/publisher.service';

@Module({
  imports: [PrismaModule, RedisModule, CommonModule],
  controllers: [AdminKnowledgeController],
  providers: [
    KnowledgeRepository,
    NewsFetcherService,
    AISummarizerService,
    PublisherService,
    KnowledgeCenterService,
  ],
  exports: [KnowledgeCenterService],
})
export class KnowledgeModule {}
