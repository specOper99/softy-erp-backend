import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BookingStatus, TaskStatus } from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceService } from '../finance/services/finance.service';
import { CreateBookingDto, CreateClientDto, UpdateBookingDto } from './dto';
import { Booking } from './entities/booking.entity';
import { Client } from './entities/client.entity';
import { BookingUpdatedEvent } from './events/booking-updated.event';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(ServicePackage)
    private readonly packageRepository: Repository<ServicePackage>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly financeService: FinanceService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const tenantId = TenantContextService.getTenantId();
    // Validate package exists and get price
    const pkg = await this.packageRepository.findOne({
      where: { id: dto.packageId, tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(
        `ServicePackage with ID ${dto.packageId} not found`,
      );
    }

    const booking = this.bookingRepository.create({
      clientId: dto.clientId,
      eventDate: new Date(dto.eventDate),
      packageId: dto.packageId,
      notes: dto.notes,
      totalPrice: pkg.price,
      status: BookingStatus.DRAFT,
      tenantId,
    });

    return this.bookingRepository.save(booking);
  }

  async findAll(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.bookingRepository.find({
      where: { tenantId },
      relations: ['servicePackage', 'client'],
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findOne(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantId();
    const booking = await this.bookingRepository.findOne({
      where: { id, tenantId },
      relations: [
        'client',
        'servicePackage',
        'servicePackage.packageItems',
        'servicePackage.packageItems.taskType',
        'tasks',
        'tasks.assignedUser',
        'tasks.taskType',
      ],
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.findOne(id);

    if (booking.status !== BookingStatus.DRAFT && dto.status === undefined) {
      throw new BadRequestException('Cannot update a non-draft booking');
    }

    if (dto.eventDate) {
      booking.eventDate = new Date(dto.eventDate);
    }

    Object.assign(booking, {
      ...dto,
      eventDate: dto.eventDate ? new Date(dto.eventDate) : booking.eventDate,
    });

    const savedBooking = await this.bookingRepository.save(booking);

    this.eventBus.publish(
      new BookingUpdatedEvent(
        savedBooking.id,
        savedBooking.tenantId,
        { ...dto } as Record<string, unknown>, // Cast to satisfy Record<string, unknown>
        new Date(),
      ),
    );

    return savedBooking;
  }

  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('Can only delete draft bookings');
    }
    await this.bookingRepository.softRemove(booking);
  }

  async cancelBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    booking.status = BookingStatus.CANCELLED;
    const savedBooking = await this.bookingRepository.save(booking);

    await this.auditService.log({
      action: 'STATUS_CHANGE',
      entityName: 'Booking',
      entityId: booking.id,
      oldValues: { status: oldStatus },
      newValues: { status: BookingStatus.CANCELLED },
    });

    return savedBooking;
  }

  async completeBooking(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    const oldStatus = booking.status;

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }

    // Check if all tasks are completed
    const tasksArray = await booking.tasks;
    if (!tasksArray) {
      throw new BadRequestException('No tasks found for this booking');
    }
    const pendingTasks = tasksArray.filter(
      (t) => t.status !== TaskStatus.COMPLETED,
    );
    if (pendingTasks && pendingTasks.length > 0) {
      throw new BadRequestException(
        `Cannot complete booking: ${pendingTasks.length} tasks are still pending`,
      );
    }

    booking.status = BookingStatus.COMPLETED;
    const savedBooking = await this.bookingRepository.save(booking);

    await this.auditService.log({
      action: 'STATUS_CHANGE',
      entityName: 'Booking',
      entityId: booking.id,
      oldValues: { status: oldStatus },
      newValues: { status: BookingStatus.COMPLETED },
    });

    return savedBooking;
  }

  // Client Management Methods
  async createClient(dto: CreateClientDto): Promise<Client> {
    const tenantId = TenantContextService.getTenantId();
    const client = this.clientRepository.create({
      ...dto,
      tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAllClients(
    query: PaginationDto = new PaginationDto(),
  ): Promise<Client[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.clientRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findClientById(id: string): Promise<Client> {
    const tenantId = TenantContextService.getTenantId();
    const client = await this.clientRepository.findOne({
      where: { id, tenantId },
    });
    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }
    return client;
  }
}
