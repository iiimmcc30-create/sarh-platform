import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { CommonModule } from '../common/common.module';
import { ButchersModule } from '../butchers/butchers.module';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { ButcherApplicationsController } from './butcher-applications.controller';
import { JoinPageController } from './join-page.controller';
import { ButcherApplicationUserService } from './services/application.service';
import { PublicButcherJoinService } from './services/public-join.service';
import { ButcherApplicationDocumentService } from './services/document.service';
import { ButcherApplicationAdminService } from './services/admin.service';
import { ButcherApplicationNotificationsService } from './services/butcher-application-notifications.service';
import { TransactionService } from './services/transaction.service';
import { ApplicationRepository } from './repositories/application.repository';
import { DocumentRepository } from './repositories/document.repository';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    CommonModule,
    ButchersModule,
    AuthModule,
    UploadModule,
  ],
  controllers: [ButcherApplicationsController, JoinPageController],
  providers: [
    ApplicationRepository,
    DocumentRepository,
    TransactionService,
    ButcherApplicationUserService,
    PublicButcherJoinService,
    ButcherApplicationDocumentService,
    ButcherApplicationAdminService,
    ButcherApplicationNotificationsService,
  ],
  exports: [
    ApplicationRepository,
    ButcherApplicationUserService,
    ButcherApplicationDocumentService,
    ButcherApplicationAdminService,
  ],
})
export class ButcherApplicationsModule {}
