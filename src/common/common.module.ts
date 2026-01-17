import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './entities/outbox-event.entity';
import { FlagsService } from './flags/flags.service';
import { OutboxRelayService } from './services/outbox-relay.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxRelayService, FlagsService],
  exports: [OutboxRelayService, TypeOrmModule, FlagsService],
})
export class CommonModule {}
