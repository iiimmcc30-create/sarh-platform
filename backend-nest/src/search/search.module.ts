import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { ExploreSearchService } from './explore-search.service';
import { SearchController } from './search.controller';
import { SearchService, SearchRepository } from './search.service';
import { UnifiedSearchRepository } from './repositories/unified-search.repository';
import { UnifiedSearchService } from './unified-search.service';
import { LivestockDictionaryService } from './terms/livestock-dictionary.service';

@Module({
  imports: [RedisModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    ExploreSearchService,
    UnifiedSearchRepository,
    UnifiedSearchService,
    LivestockDictionaryService,
  ],
  exports: [
    UnifiedSearchService,
    SearchService,
    ExploreSearchService,
    LivestockDictionaryService,
  ],
})
export class SearchModule {}
