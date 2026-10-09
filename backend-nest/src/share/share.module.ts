import { Module } from '@nestjs/common';
import { SharePreviewController } from './share-preview.controller';

/** Public link previews (Open Graph) for shared /l, /post and /u links. */
@Module({
  controllers: [SharePreviewController],
})
export class ShareModule {}
