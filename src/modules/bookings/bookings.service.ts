import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BookingStatus,
  ReferenceType,
  TaskStatus,
  TransactionType,
} from '../../common/enums';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { ServicePackage } from '../catalog/entities/service-package.entity';
import { FinanceService } from '../finance/services/finance.service';
import { MailService } from '../mail/mail.service';
import { Task } from '../tasks/entities/task.entity';
import {
  ConfirmBookingResponseDto,
  CreateBookingDto,
  UpdateBookingDto,
} from './dto';
import { Booking } from './entities/booking.entity';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(ServicePackage)
    private readonly packageRepository: Repository<ServicePackage>,
    private readonly financeService: FinanceService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
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
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
      clientEmail: dto.clientEmail,
      eventDate: new Date(dto.eventDate),
      packageId: dto.packageId,
      notes: dto.notes,
      totalPrice: pkg.price,
      status: BookingStatus.DRAFT,
      tenantId,
    });

    return this.bookingRepository.save(booking);
  }

  async findAll(): Promise<Booking[]> {
    const tenantId = TenantContextService.getTenantId();
    return this.bookingRepository.find({
      where: { tenantId },
      relations: ['servicePackage', 'tasks'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Booking> {
    const tenantId = TenantContextService.getTenantId();
    const booking = await this.bookingRepository.findOne({
      where: { id, tenantId },
      relations: [
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

    return this.bookingRepository.save(booking);
  }

  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException('Can only delete draft bookings');
    }
    await this.bookingRepository.softRemove(booking);
  }

  /**
   * WORKFLOW 1: Booking Confirmation
   * Transactional steps:
   * 1. Update booking status to CONFIRMED
   * 2. Generate Tasks from ServicePackage items
   * 3. Create INCOME transaction in Finance
   * 4. Rollback all on failure
   */
  async confirmBooking(id: string): Promise<ConfirmBookingResponseDto> {
    const booking = await this.findOne(id);

    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException(
        `Booking is already ${booking.status}. Only DRAFT bookings can be confirmed.`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Update booking status to CONFIRMED
      booking.status = BookingStatus.CONFIRMED;
      await queryRunner.manager.save(booking);

      // Step 2: Generate Tasks from package items
      const packageItems = booking.servicePackage?.packageItems || [];
      const createdTasks: Task[] = [];

      for (const item of packageItems) {
        for (let i = 0; i < item.quantity; i++) {
          const task = queryRunner.manager.create(Task, {
            bookingId: booking.id,
            taskTypeId: item.taskTypeId,
            status: TaskStatus.PENDING,
            commissionSnapshot: item.taskType?.defaultCommissionAmount || 0,
            dueDate: booking.eventDate,
            tenantId: booking.tenantId, // Inherit tenant from booking
          });
          const savedTask = await queryRunner.manager.save(task);
          createdTasks.push(savedTask);
        }
      }

      // Step 3: Create INCOME transaction
      const transaction =
        await this.financeService.createTransactionWithManager(
          queryRunner.manager,
          {
            type: TransactionType.INCOME,
            amount: Number(booking.totalPrice),
            category: 'Booking Payment',
            referenceId: booking.id,
            referenceType: ReferenceType.BOOKING,
            description: `Booking confirmed: ${booking.clientName} - ${booking.servicePackage?.name}`,
            transactionDate: new Date(),
          },
        );

      // Step 4: Audit Log
      await this.auditService.log(
        {
          action: 'STATUS_CHANGE',
          entityName: 'Booking',
          entityId: booking.id,
          oldValues: { status: BookingStatus.DRAFT },
          newValues: { status: BookingStatus.CONFIRMED },
          notes: 'Booking confirmed, tasks generated and payment recorded.',
        },
        queryRunner.manager,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      // Send confirmation email (async, don't block response)
      this.mailService
        .sendBookingConfirmation({
          clientName: booking.clientName,
          clientEmail: booking.clientEmail || '',
          eventDate: booking.eventDate,
          packageName: booking.servicePackage?.name || 'Service Package',
          totalPrice: Number(booking.totalPrice),
          bookingId: booking.id,
        })
        .catch((err) => console.error('Failed to send booking email:', err));

      return {
        booking,
        tasksCreated: createdTasks.length,
        transactionId: transaction.id,
      };
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
    const pendingTasks = booking.tasks?.filter(
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
}
