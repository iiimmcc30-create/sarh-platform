import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ListingsModule } from './listings/listings.module';
import { PostsModule } from './posts/posts.module';
import { StoriesModule } from './stories/stories.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PlansModule } from './plans/plans.module';
import { LivestreamsModule } from './livestreams/livestreams.module';
import { MessagesModule } from './messages/messages.module';
import { UploadModule } from './upload/upload.module';
import { AdminModule } from './admin/admin.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { FeesModule } from './fees/fees.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { GatewaySharedModule } from './gateway/gateway-shared.module';
import { ReportsModule } from './reports/reports.module';
import { OfficialServicesModule } from './official-services/official-services.module';
import { SupportModule } from './support/support.module';
import { ContentModule } from './content/content.module';
import { EditorialStoriesModule } from './editorial-stories/editorial-stories.module';
import { ExploreSarhBannersModule } from './explore-sarh-banners/explore-sarh-banners.module';
import { FeedSuppliersModule } from './feed-suppliers/feed-suppliers.module';
import { MarketCategoriesModule } from './market-categories/market-categories.module';
import { SettingsModule } from './settings/settings.module';
import { HomeExploreModule } from './home-explore/home-explore.module';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    GatewaySharedModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    HomeExploreModule,
    MarketCategoriesModule,
    ListingsModule,
    PostsModule,
    StoriesModule,
    NotificationsModule,
    PaymentsModule,
    IntegrationsModule,
    SubscriptionsModule,
    PlansModule,
    LivestreamsModule,
    MessagesModule,
    UploadModule,
    AdminModule,
    KnowledgeModule,
    FeesModule,
    SearchModule,
    HealthModule,
    ReportsModule,
    OfficialServicesModule,
    SupportModule,
    ContentModule,
    EditorialStoriesModule,
    ExploreSarhBannersModule,
    FeedSuppliersModule,
  ],
})
export class AppModule {}
