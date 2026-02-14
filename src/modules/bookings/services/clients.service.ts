import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Readable } from 'stream';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { CreateClientDto, UpdateClientDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { Client } from '../entities/client.entity';
import { ClientCreatedEvent, ClientDeletedEvent, ClientUpdatedEvent } from '../events/client.events';
import type { StreamableResponse } from '../types/export.types';

/**
 * Service for managing clients.
 * Extracted from BookingsService for better separation of concerns.
 */
import { BookingRepository } from '../repositories/booking.repository';
import { ClientRepository } from '../repositories/client.repository';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly auditService: AuditService,
    private readonly exportService: ExportService,
    private readonly eventBus: EventBus,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = this.clientRepository.create({
      ...dto,
    });
    const savedClient = await this.clientRepository.save(client);

    // Publish domain event
    this.eventBus.publish(
      new ClientCreatedEvent(
        savedClient.id,
        tenantId,
        savedClient.email,
        savedClient.name.split(' ')[0] || savedClient.name,
        savedClient.name.split(' ').slice(1).join(' ') || '',
        savedClient.phone,
        savedClient.tags || [],
        savedClient.createdAt,
      ),
    );

    return savedClient;
  }

  async findAll(
    query: { getSkip(): number; getTake(): number } = { getSkip: () => 0, getTake: () => 20 },
    tags?: string[],
  ): Promise<Client[]> {
    const queryBuilder = this.clientRepository
      .createQueryBuilder('client')
      // Tenant scoping handled by repository
      .orderBy('client.createdAt', 'DESC')
      .skip(query.getSkip())
      .take(query.getTake());

    // Filter by tags if provided (JSONB array containment)
    if (tags && tags.length > 0) {
      queryBuilder.andWhere('client.tags @> :tags', {
        tags: JSON.stringify(tags),
      });
    }

    return queryBuilder.getMany();
  }

  async findById(id: string): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id },
    });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
    return client;
  }

  async updateTags(id: string, tags: string[]): Promise<Client> {
    const client = await this.findById(id);
    client.tags = tags;
    return this.clientRepository.save(client);
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = await this.findById(id);
    const oldValues: Record<string, unknown> = {};
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (dto.name !== undefined && dto.name !== client.name) {
      changes['name'] = { old: client.name, new: dto.name };
      oldValues.name = client.name;
      client.name = dto.name;
    }
    if (dto.email !== undefined && dto.email !== client.email) {
      changes['email'] = { old: client.email, new: dto.email };
      oldValues.email = client.email;
      client.email = dto.email;
    }
    if (dto.phone !== undefined && dto.phone !== client.phone) {
      changes['phone'] = { old: client.phone, new: dto.phone };
      client.phone = dto.phone;
    }
    if (dto.notes !== undefined && dto.notes !== client.notes) {
      changes['notes'] = { old: client.notes, new: dto.notes };
      client.notes = dto.notes;
    }
    if (dto.tags !== undefined) {
      changes['tags'] = { old: client.tags, new: dto.tags };
      client.tags = dto.tags;
    }

    const savedClient = await this.clientRepository.save(client);

    // Publish domain event if there were changes
    if (Object.keys(changes).length > 0) {
      this.eventBus.publish(new ClientUpdatedEvent(savedClient.id, tenantId, changes, new Date()));
    }

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'Client',
      entityId: client.id,
      oldValues,
      newValues: dto as Record<string, unknown>,
    });

    return savedClient;
  }

  async delete(id: string): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = await this.findById(id);

    const bookingsCount = await this.bookingRepository.count({
      where: { clientId: id }, // tenantId handled by repo
    });

    if (bookingsCount > 0) {
      throw new BadRequestException(
        `Cannot delete client with ${bookingsCount} booking(s). Please reassign or delete bookings first.`,
      );
    }

    await this.clientRepository.softRemove(client);

    // Publish domain event
    this.eventBus.publish(new ClientDeletedEvent(client.id, tenantId, client.email, new Date()));

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'Client',
      entityId: id,
      oldValues: { name: client.name, email: client.email },
      newValues: {},
    });
  }

  async getClientExportStream(): Promise<Readable> {
    return (
      this.clientRepository
        .createQueryBuilder('client')
        .leftJoin(Booking, 'booking', 'booking.clientId = client.id AND booking.tenantId = client.tenantId')
        // tenantId handled by repo
        .select(['client.id', 'client.name', 'client.email', 'client.phone', 'client.notes', 'client.createdAt'])
        .addSelect('COUNT(booking.id)', 'bookingCount')
        .groupBy('client.id')
        .orderBy('client.createdAt', 'DESC')
        .stream()
    );
  }

  async exportToCSV(res: StreamableResponse): Promise<void> {
    const stream = await this.getClientExportStream();

    const fields = ['id', 'name', 'email', 'phone', 'notes', 'bookingCount', 'createdAt'];

    // Type for raw stream row from QueryBuilder
    interface ClientExportRow {
      client_id: string;
      client_name: string;
      client_email: string | null;
      client_phone: string | null;
      client_notes: string | null;
      client_createdAt: Date;
      bookingCount: string;
    }

    await this.exportService.streamFromStream(
      res,
      stream,
      `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
      (row: ClientExportRow) => ({
        id: row.client_id,
        name: row.client_name,
        email: row.client_email || '',
        phone: row.client_phone || '',
        notes: row.client_notes || '',
        bookingCount: Number(row.bookingCount) || 0,
        createdAt: row.client_createdAt,
      }),
    );
  }
}
