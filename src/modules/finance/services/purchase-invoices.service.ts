import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreatePurchaseInvoiceDto } from '../dto';
import { PurchaseInvoice, Vendor } from '../entities';
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
      const createdInvoice = await this.dataSource.transaction(async (manager) => {
        const vendor = await manager.findOne(Vendor, {
          where: { id: dto.vendorId, tenantId },
        });

        if (!vendor) {
          throw new NotFoundException('finance.vendor_not_found');
        }

        const invoiceDate = new Date(dto.invoiceDate);
        const transaction = await this.financeService.createTransactionWithManager(manager, {
          type: TransactionType.EXPENSE,
          amount: dto.totalAmount,
          category: 'Purchase Invoice',
          description: `Purchase invoice ${dto.invoiceNumber} - ${vendor.name}`,
          transactionDate: invoiceDate,
        });

        const purchaseInvoice = manager.create(PurchaseInvoice, {
          tenantId,
          vendorId: vendor.id,
          invoiceNumber: dto.invoiceNumber,
          invoiceDate,
          totalAmount: dto.totalAmount,
          notes: dto.notes ?? null,
          transactionId: transaction.id,
        });

        return manager.save(purchaseInvoice);
      });

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
