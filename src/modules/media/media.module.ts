import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AttachmentRepository } from './repositories/attachment.repository';
import { StorageService } from './storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  controllers: [MediaController],
  providers: [MediaService, StorageService, AttachmentRepository],
  exports: [MediaService, StorageService, AttachmentRepository],
})
export class MediaModule {}
