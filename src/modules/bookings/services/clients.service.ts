import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ExportService } from '../../../common/services/export.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { CreateClientDto, UpdateClientDto } from '../dto';
import { Booking } from '../entities/booking.entity';
import { Client } from '../entities/client.entity';
import type {
  ClientExportRow,
  StreamableResponse,
} from '../types/export.types';

/**
 * Service for managing clients.
 * Extracted from BookingsService for better separation of concerns.
 */
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly auditService: AuditService,
    private readonly exportService: ExportService,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = this.clientRepository.create({
      ...dto,
      tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAll(
    query: PaginationDto = new PaginationDto(),
    tags?: string[],
  ): Promise<Client[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    const queryBuilder = this.clientRepository
      .createQueryBuilder('client')
      .where('client.tenantId = :tenantId', { tenantId })
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
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const client = await this.clientRepository.findOne({
      where: { id, tenantId },
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
    const client = await this.findById(id);

    if (dto.name !== undefined) client.name = dto.name;
    if (dto.email !== undefined) client.email = dto.email;
    if (dto.phone !== undefined) client.phone = dto.phone;
    if (dto.notes !== undefined) client.notes = dto.notes;
    if (dto.tags !== undefined) client.tags = dto.tags;

    const savedClient = await this.clientRepository.save(client);

    await this.auditService.log({
      action: 'UPDATE',
      entityName: 'Client',
      entityId: client.id,
      oldValues: { name: client.name, email: client.email },
      newValues: dto as Record<string, unknown>,
    });

    return savedClient;
  }

  async delete(id: string): Promise<void> {
    const client = await this.findById(id);

    const bookingsCount = await this.bookingRepository.count({
      where: { clientId: id, tenantId: client.tenantId },
    });

    if (bookingsCount > 0) {
      throw new BadRequestException(
        `Cannot delete client with ${bookingsCount} booking(s). Please reassign or delete bookings first.`,
      );
    }

    await this.clientRepository.softRemove(client);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'Client',
      entityId: id,
      oldValues: { name: client.name, email: client.email },
      newValues: {},
    });
  }

  async exportToCSV(res: StreamableResponse): Promise<void> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // Get clients with booking count
    const clientsWithCount = await this.clientRepository
      .createQueryBuilder('client')
      .leftJoin('client.bookings', 'booking')
      .where('client.tenantId = :tenantId', { tenantId })
      .select([
        'client.id',
        'client.name',
        'client.email',
        'client.phone',
        'client.notes',
        'client.createdAt',
      ])
      .addSelect('COUNT(booking.id)', 'bookingCount')
      .groupBy('client.id')
      .orderBy('client.createdAt', 'DESC')
      .getRawMany<ClientExportRow>();

    const csvData = clientsWithCount.map((c: ClientExportRow) => ({
      id: c.client_id,
      name: c.client_name,
      email: c.client_email || '',
      phone: c.client_phone || '',
      notes: c.client_notes || '',
      bookingCount: Number(c.bookingCount) || 0,
      createdAt: c.client_createdAt,
    }));

    const fields = [
      'id',
      'name',
      'email',
      'phone',
      'notes',
      'bookingCount',
      'createdAt',
    ];

    this.exportService.streamCSV(
      res,
      csvData,
      `clients-export-${new Date().toISOString().split('T')[0]}.csv`,
      fields,
    );
  }
}
