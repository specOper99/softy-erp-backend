import { Module, forwardRef } from '@nestjs/common';
import { AuthorizationModule } from './authorization/authorization.module';
import { FlagsService } from './flags/flags.service';
import { OutboxModule } from './outbox/outbox.module';
import { CursorAuthService } from './services/cursor-auth.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { EncryptionService } from './services/encryption.service';
import { PasswordHashService } from './services/password-hash.service';
import { ResourceOwnershipGuard } from './guards/resource-ownership.guard';

@Module({
  imports: [forwardRef(() => OutboxModule), AuthorizationModule],
  providers: [
    FlagsService,
    PasswordHashService,
    CursorAuthService,
    DistributedLockService,
    EncryptionService,
    ResourceOwnershipGuard,
  ],
  exports: [
    OutboxModule,
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
