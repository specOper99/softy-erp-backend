import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TENANT_REPO_PURCHASE_INVOICE } from '../../../common/constants/tenant-repo.tokens';
import type { MockRepository } from '../../../../test/helpers/mock-factories';
import { createMockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import type { CreatePurchaseInvoiceDto } from '../api/dto';
import type { Vendor } from '../domain/entities';
import type { PurchaseInvoice } from '../domain/entities';
import { TransactionType } from '../domain/enums/transaction-type.enum';
import { FinanceService } from './finance.service';
import { PurchaseInvoicesService } from './purchase-invoices.service';

describe('PurchaseInvoicesService', () => {
  let service: PurchaseInvoicesService;
  let repository: MockRepository<PurchaseInvoice>;
  let financeService: { createTransactionWithManager: jest.Mock; notifyTransactionCreated: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const dto: CreatePurchaseInvoiceDto = {
    vendorId: 'vendor-1',
    invoiceNumber: 'PI-2026-0001',
    invoiceDate: '2026-02-18T00:00:00.000Z',
    totalAmount: 500,
    notes: 'Office supplies',
  };

  const persistedInvoice: PurchaseInvoice = {
    id: 'pi-1',
    tenantId: 'tenant-123',
    vendorId: 'vendor-1',
    invoiceNumber: 'PI-2026-0001',
    invoiceDate: new Date(dto.invoiceDate),
    totalAmount: 500,
    notes: 'Office supplies',
    transactionId: 'txn-1',
    vendor: { id: 'vendor-1', name: 'Acme Supplies' } as Vendor,
    transaction: { id: 'txn-1' } as PurchaseInvoice['transaction'],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PurchaseInvoice;

  beforeEach(async () => {
    repository = createMockRepository<PurchaseInvoice>();

    manager = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((_entity, payload) => payload),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    financeService = {
      createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'txn-1' }),
      notifyTransactionCreated: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (entityManager: typeof manager) => Promise<unknown>) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseInvoicesService,
        {
          provide: TENANT_REPO_PURCHASE_INVOICE,
          useValue: repository,
        },
        {
          provide: FinanceService,
          useValue: financeService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<PurchaseInvoicesService>(PurchaseInvoicesService);
    jest.clearAllMocks();
    mockTenantContext('tenant-123');
  });

  it('creates invoice and linked expense transaction', async () => {
    manager.findOne.mockResolvedValue({ id: 'vendor-1', tenantId: 'tenant-123', name: 'Acme Supplies' } as Vendor);
    manager.save.mockResolvedValue({ id: 'pi-1' });
    repository.findOne.mockResolvedValue(persistedInvoice);

    const result = await service.create(dto);

    expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        type: TransactionType.EXPENSE,
        amount: dto.totalAmount,
        category: 'Purchase Invoice',
      }),
    );
    // The transaction must be created WITHOUT a purchaseInvoiceId — the link
    // is back-filled once the invoice id is known.  This keeps the
    // at-most-one check constraint satisfied at every step of the flow.
    expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
      manager,
      expect.not.objectContaining({ purchaseInvoiceId: expect.anything() }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'txn-1',
        invoiceNumber: dto.invoiceNumber,
      }),
    );
    // Reverse FK link (txn → invoice) is written as a single UPDATE so the
    // composite FK FK_transaction_purchase_invoice_composite and the
    // extended at-most-one check constraint are both satisfied.
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      'txn-1',
      expect.objectContaining({ purchaseInvoiceId: 'pi-1' }),
    );
    expect(result.transactionId).toBe('txn-1');
  });

  it('blocks cross-tenant vendor ID', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('does not expose invoice id owned by another tenant', async () => {
    // TenantAwareRepository scopes findOne by tenantId; cross-tenant rows are invisible.
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById('invoice-owned-by-other-tenant')).rejects.toThrow(NotFoundException);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'invoice-owned-by-other-tenant' },
      relations: ['vendor', 'transaction'],
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('maps duplicate invoice constraint to ConflictException', async () => {
    manager.findOne.mockResolvedValue({ id: 'vendor-1', tenantId: 'tenant-123', name: 'Acme Supplies' } as Vendor);
    manager.save.mockRejectedValue({ code: '23505' });

    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    // Reverse FK UPDATE must NOT run when the invoice insert already failed —
    // otherwise the txn insert (and the vendor lookup) would be silently
    // persisted without an invoice.
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rolls back the transaction insert when the reverse FK UPDATE fails', async () => {
    manager.findOne.mockResolvedValue({ id: 'vendor-1', tenantId: 'tenant-123', name: 'Acme Supplies' } as Vendor);
    manager.save.mockResolvedValue({ id: 'pi-1' });
    manager.update.mockRejectedValue(new Error('FK violation'));

    await expect(service.create(dto)).rejects.toThrow('FK violation');
    // The DB transaction wrapper handles the rollback; from the service's
    // point of view, the error simply propagates.  The key invariant is
    // that the post-commit notify step MUST NOT run with a partially
    // linked transaction, which would leak the new event to dashboards.
    expect(financeService.notifyTransactionCreated).not.toHaveBeenCalled();
  });
});
