import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from '../../common/services/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Webhook } from '../webhooks/entities/webhook.entity';
import { AdminController } from './admin.controller';
import { KeyRotationService } from './services/key-rotation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook, AuditLog])],
  controllers: [AdminController],
  providers: [KeyRotationService, EncryptionService, AuditService],
})
export class AdminModule {}
