import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentController } from './content.controller';
import { PrivacyPageController } from './privacy-page.controller';
import { ContentService } from './content.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController, PrivacyPageController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
