import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from './authorization/authorization.module';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ResourceOwnershipGuard } from './guards/resource-ownership.guard';
import { FlagsService } from './flags/flags.service';
import { CursorAuthService } from './services/cursor-auth.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { EncryptionService } from './services/encryption.service';
import { OutboxRelayService } from './services/outbox-relay.service';
import { PasswordHashService } from './services/password-hash.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent]), AuthorizationModule],
  providers: [
    OutboxRelayService,
    FlagsService,
    PasswordHashService,
    CursorAuthService,
    DistributedLockService,
    EncryptionService,
    ResourceOwnershipGuard,
  ],
  exports: [
    OutboxRelayService,
    TypeOrmModule,
    FlagsService,
    PasswordHashService,
    CursorAuthService,
    DistributedLockService,
    EncryptionService,
    AuthorizationModule,
    ResourceOwnershipGuard,
  ],
})
export class CommonModule {}
