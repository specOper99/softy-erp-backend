import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './entities/outbox-event.entity';
import { FlagsService } from './flags/flags.service';
import { CursorAuthService } from './services/cursor-auth.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { OutboxRelayService } from './services/outbox-relay.service';
import { PasswordHashService } from './services/password-hash.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxRelayService, FlagsService, PasswordHashService, CursorAuthService, DistributedLockService],
  exports: [
    OutboxRelayService,
    TypeOrmModule,
    FlagsService,
    PasswordHashService,
    CursorAuthService,
    DistributedLockService,
  ],
})
export class CommonModule {}
