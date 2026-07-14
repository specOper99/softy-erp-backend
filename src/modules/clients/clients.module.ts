import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportService } from '../../common/services/export.service';
import { AuditModule } from '../audit/audit.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ClientsController } from './api/clients.controller';
import { ClientsService } from './application/clients.service';
import { Client } from './domain/entities';
import { ClientRepository } from './infrastructure/client.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Client]), AuditModule, forwardRef(() => BookingsModule)],
  controllers: [ClientsController],
  providers: [ClientsService, ClientRepository, ExportService],
  exports: [ClientsService, ClientRepository, TypeOrmModule],
})
export class ClientsModule {}
