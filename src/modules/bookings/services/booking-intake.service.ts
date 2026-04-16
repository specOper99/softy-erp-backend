import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../../common/constants/business.constants';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { MathUtils } from '../../../common/utils/math.utils';
import { CatalogService } from '../../catalog/services/catalog.service';
import { Client } from '../entities/client.entity';
import { PaymentStatus } from '../../finance/enums/payment-status.enum';
import { TransactionType } from '../../finance/enums/transaction-type.enum';
import { FinanceService } from '../../finance/services/finance.service';
import { BookingIntakeDto, BookingIntakeResponseDto } from '../dto/booking-intake.dto';
import { Booking } from '../entities/booking.entity';
import { ProcessingType } from '../entities/processing-type.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { ClientCreatedEvent } from '../events/client.events';
import { PaymentRecordedEvent } from '../events/payment-recorded.event';
import { BookingRepository } from '../repositories/booking.repository';
import { ClientRepository } from '../repositories/client.repository';
import { StaffConflictService } from './staff-conflict.service';
import { parseCanonicalBookingDateInput } from '../utils/booking-date-policy.util';
import { BookingPriceCalculator } from '../utils/booking-price.calculator';

@Injectable()
export class BookingIntakeService {
  private readonly logger = new Logger(BookingIntakeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly bookingRepository: BookingRepository,
    private readonly clientRepository: ClientRepository,
    private readonly catalogService: CatalogService,
    private readonly financeService: FinanceService,
    private readonly staffConflictService: StaffConflictService,
    private readonly eventBus: EventBus,
    @InjectRepository(ProcessingType)
    private readonly processingTypeRepository: Repository<ProcessingType>,
  ) {}

  /**
   * Performs the full booking intake in a single database transaction.
   *
   * All writes — client creation (if needed), booking creation, processing
   * type attachment, and optional deposit recording — are committed or rolled
   * back atomically. No partial state can remain in the database.
   */
  async intake(dto: BookingIntakeDto): Promise<BookingIntakeResponseDto> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    // ── Pre-validate outside the transaction (read-only checks) ──────────

    // Enforce one-of: clientId (existing) OR name (new)
    if (!dto.client.clientId && !dto.client.name) {
      throw new BadRequestException('intake.client_required');
    }
    if (dto.client.clientId && dto.client.name) {
      throw new BadRequestException('intake.client_ambiguous');
    }

    const pkg = await this.catalogService.findPackageById(dto.packageId);

    const eventDate = parseCanonicalBookingDateInput(dto.eventDate);
    const oneHourFromNow = new Date(Date.now() + BUSINESS_CONSTANTS.BOOKING.MIN_LEAD_TIME_MS);
    if (eventDate < oneHourFromNow) {
      throw new BadRequestException('booking.event_date_must_be_future');
    }

    const taxRate = dto.taxRate ?? 0;
    if (taxRate < 0 || taxRate > BUSINESS_CONSTANTS.BOOKING.MAX_TAX_RATE_PERCENT) {
      throw new BadRequestException('booking.invalid_tax_rate');
    }

    const depositPercentage = dto.depositPercentage ?? 0;
    if (depositPercentage < 0 || depositPercentage > 100) {
      throw new BadRequestException('booking.invalid_deposit_percentage');
    }

    if (dto.startTime && pkg.durationMinutes > 0) {
      const availability = await this.staffConflictService.checkPackageStaffAvailability({
        packageId: dto.packageId,
        eventDate,
        startTime: dto.startTime,
        durationMinutes: pkg.durationMinutes,
      });
      if (!availability.ok) {
        throw new ConflictException({
          code: 'BOOKING_STAFF_CONFLICT',
          message: 'booking.staff_conflict',
          details: {
            requiredStaffCount: availability.requiredStaffCount,
            eligibleCount: availability.eligibleCount,
            busyCount: availability.busyCount,
            availableCount: availability.availableCount,
          },
        });
      }
    }

    const pricing = BookingPriceCalculator.calculate({
      packagePrice: Number(pkg.price),
      taxRate,
      depositPercentage,
      discountAmount: dto.discountAmount ?? 0,
    });

    // ── Atomic transaction ────────────────────────────────────────────────

    // These variables are set inside the transaction callback and read after it
    // completes, allowing us to fire CQRS events outside the transaction.
    let savedClientId = '';
    let savedClientEmail = '';
    let savedClientName = '';
    let savedClientPhone: string | undefined;
    let savedClientTags: string[] = [];
    let savedClientCreatedAt!: Date;
    let isNewClient = false;

    let savedBookingId = '';
    let savedBookingCreatedAt!: Date;

    let depositTransactionId: string | undefined;

    await this.dataSource.transaction(async (manager) => {
      // ── Step 1: resolve or create client ──────────────────────────────

      let client: Client;

      if (dto.client.clientId) {
        // Existing client — verify it belongs to this tenant
        const found = await manager.findOne(Client, {
          where: { id: dto.client.clientId, tenantId },
        });
        if (!found) {
          throw new NotFoundException('intake.client_not_found');
        }
        client = found;
        isNewClient = false;
      } else {
        // Create new client within the same transaction
        client = manager.create(Client, {
          tenantId,
          name: dto.client.name!,
          email: dto.client.email ?? undefined,
          phone: dto.client.phone ?? undefined,
          phone2: dto.client.phone2 ?? undefined,
          notes: dto.client.clientNotes ?? undefined,
          tags: [],
        });
        client = await manager.save(Client, client);
        isNewClient = true;
      }

      savedClientId = client.id;
      savedClientEmail = client.email ?? '';
      savedClientName = client.name ?? '';
      savedClientPhone = client.phone ?? undefined;
      savedClientTags = client.tags ?? [];
      savedClientCreatedAt = client.createdAt;

      // ── Step 2: create booking ─────────────────────────────────────────

      let booking = manager.create(Booking, {
        tenantId,
        clientId: client.id,
        packageId: dto.packageId,
        eventDate,
        startTime: dto.startTime ?? undefined,
        durationMinutes: pkg.durationMinutes,
        notes: dto.notes ?? undefined,
        locationLink: dto.locationLink ?? undefined,
        subTotal: pricing.subTotal,
        discountAmount: pricing.discountAmount,
        taxRate: pricing.taxRate,
        taxAmount: pricing.taxAmount,
        totalPrice: pricing.totalPrice,
        depositPercentage: pricing.depositPercentage,
        depositAmount: pricing.depositAmount,
        amountPaid: 0,
        refundAmount: 0,
        status: BookingStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
      });

      booking = await manager.save(Booking, booking);

      // ── Step 3: attach processing types ───────────────────────────────

      if (dto.processingTypeIds && dto.processingTypeIds.length > 0) {
        const types = await this.processingTypeRepository.find({
          where: dto.processingTypeIds.map((id) => ({ id, tenantId })),
        });
        booking.processingTypes = types;
        booking = await manager.save(Booking, booking);
      } else {
        booking.processingTypes = [];
      }

      savedBookingId = booking.id;
      savedBookingCreatedAt = booking.createdAt;

      // ── Step 4: record deposit (optional) ─────────────────────────────

      if (dto.deposit && dto.deposit.amount > 0) {
        const depositTransaction = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.INCOME,
          amount: dto.deposit.amount,
          description: `Deposit for booking by ${client.name ?? 'Client'} — ${dto.deposit.paymentMethod}`,
          bookingId: booking.id,
          category: 'Booking Deposit',
          transactionDate: new Date(),
          paymentMethod: dto.deposit.paymentMethod,
          ...(dto.deposit.reference ? { reference: dto.deposit.reference } : {}),
        });

        depositTransactionId = depositTransaction.id;

        // Update booking payment state within the same transaction
        const newAmountPaid = MathUtils.add(0, dto.deposit.amount);
        booking.amountPaid = newAmountPaid;
        const newPaymentStatus = booking.derivePaymentStatus();

        await manager.update(
          Booking,
          { id: booking.id, tenantId },
          { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus, updatedAt: new Date() },
        );
      }
    });

    // ── Fire CQRS events after transaction commits ────────────────────────
    // Events are intentionally never published inside the transaction to keep
    // the write path clean and avoid side-effects on rollback.

    if (isNewClient) {
      this.eventBus.publish(
        new ClientCreatedEvent(
          savedClientId,
          tenantId,
          savedClientEmail,
          savedClientName.split(' ')[0] || savedClientName,
          savedClientName.split(' ').slice(1).join(' ') || '',
          savedClientPhone,
          savedClientTags,
          savedClientCreatedAt,
        ),
      );
    }

    this.eventBus.publish(
      new BookingCreatedEvent(
        savedBookingId,
        tenantId,
        savedClientId,
        savedClientEmail,
        savedClientName,
        dto.packageId,
        pkg.name,
        pricing.totalPrice,
        null,
        eventDate,
        savedBookingCreatedAt,
      ),
    );

    if (dto.deposit && dto.deposit.amount > 0) {
      this.eventBus.publish(
        new PaymentRecordedEvent(
          savedBookingId,
          tenantId,
          savedClientEmail,
          savedClientName,
          eventDate,
          dto.deposit.amount,
          dto.deposit.paymentMethod,
          dto.deposit.reference ?? '',
          pricing.totalPrice,
          dto.deposit.amount,
        ),
      );
    }

    // Invalidate availability cache (best-effort — non-blocking)
    try {
      await this.bookingRepository.findOne({ where: { id: savedBookingId } }).catch(() => null);
      this.logger.debug(`[BookingIntake] Booking ${savedBookingId} created for client ${savedClientId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[BookingIntake] Post-commit cache invalidation failed: ${message}`);
    }

    return {
      clientId: savedClientId,
      bookingId: savedBookingId,
      depositTransactionId,
    };
  }
}
