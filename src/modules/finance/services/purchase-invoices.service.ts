import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreatePurchaseInvoiceDto } from '../dto';
import { PurchaseInvoice, Vendor } from '../entities';
import { Transaction } from '../entities/transaction.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { FinanceService } from './finance.service';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    @InjectRepository(PurchaseInvoice)
    private readonly purchaseInvoiceRepository: Repository<PurchaseInvoice>,
    private readonly financeService: FinanceService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseInvoiceDto): Promise<PurchaseInvoice> {
    const tenantId = TenantContextService.getTenantIdOrThrow();

    try {
      let invoiceTx: Transaction;
      const createdInvoice = await this.dataSource.transaction(async (manager) => {
        const vendor = await manager.findOne(Vendor, {
          where: { id: dto.vendorId, tenantId },
        });

        if (!vendor) {
          throw new NotFoundException('finance.vendor_not_found');
        }

        const invoiceDate = new Date(dto.invoiceDate);
        // 1. Create the expense transaction.  `purchaseInvoiceId` is left NULL
        //    here because we don't have the invoice id yet — the relaxed
        //    "at most one parent" check constraint allows zero parents, and
        //    booking_id / task_id / payout_id are also NULL for this kind of
        //    transaction, so the new row is well-formed.
        const transaction = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.EXPENSE,
          amount: dto.totalAmount,
          category: 'Purchase Invoice',
          description: `Purchase invoice ${dto.invoiceNumber} - ${vendor.name}`,
          transactionDate: invoiceDate,
        });
        invoiceTx = transaction;

        // 2. Persist the invoice.  The `transactionId` link (invoice → tx)
        //    has existed since the table was created; it is the only side
        //    that is NOT NULL on the invoice.
        const purchaseInvoice = manager.create(PurchaseInvoice, {
          tenantId,
          vendorId: vendor.id,
          invoiceNumber: dto.invoiceNumber,
          invoiceDate,
          totalAmount: dto.totalAmount,
          notes: dto.notes ?? null,
          transactionId: transaction.id,
        });
        const savedInvoice = await manager.save(purchaseInvoice);

        // 3. Close the loop: back-fill `transactions.purchase_invoice_id`
        //    (tx → invoice) so the reverse composite FK and the extended
        //    at-most-one check constraint are both satisfied.  A single
        //    UPDATE keeps the round-trip cost negligible.
        //    This must run inside the same DB transaction so a failure here
        //    rolls back the invoice and the txn insert together — preserving
        //    the atomicity guarantee in TENANT_FINANCE_REQUIREMENTS_MATRIX.md.
        await manager.update(Transaction, transaction.id, {
          purchaseInvoiceId: savedInvoice.id,
        });

        return savedInvoice;
      });

      // Notify after commit so events and caches never reflect rolled-back data.
      await this.financeService.notifyTransactionCreated(invoiceTx!);

      return this.findById(createdInvoice.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('finance.purchase_invoice_already_exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<PurchaseInvoice[]> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    return this.purchaseInvoiceRepository.find({
      where: { tenantId },
      relations: ['vendor', 'transaction'],
      order: { invoiceDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<PurchaseInvoice> {
    const tenantId = TenantContextService.getTenantIdOrThrow();
    const purchaseInvoice = await this.purchaseInvoiceRepository.findOne({
      where: { id, tenantId },
      relations: ['vendor', 'transaction'],
    });

    if (!purchaseInvoice) {
      throw new NotFoundException('finance.purchase_invoice_not_found');
    }

    return purchaseInvoice;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const record = error as Record<string, unknown>;
    return record['code'] === '23505';
  }
}
