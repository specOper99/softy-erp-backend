import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createMockRepository, MockRepository, mockTenantContext } from '../../../../test/helpers/mock-factories';
import { CreatePurchaseInvoiceDto } from '../dto';
import { PurchaseInvoice, Vendor } from '../entities';
import { TransactionType } from '../enums/transaction-type.enum';
import { FinanceService } from './finance.service';
import { PurchaseInvoicesService } from './purchase-invoices.service';

describe('PurchaseInvoicesService', () => {
  let service: PurchaseInvoicesService;
  let repository: MockRepository<PurchaseInvoice>;
  let financeService: { createTransactionWithManager: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
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
    };

    financeService = {
      createTransactionWithManager: jest.fn().mockResolvedValue({ id: 'txn-1' }),
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
          provide: getRepositoryToken(PurchaseInvoice),
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
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'txn-1',
        invoiceNumber: dto.invoiceNumber,
      }),
    );
    expect(result.transactionId).toBe('txn-1');
  });

  it('blocks cross-tenant vendor ID', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
  });

  it('maps duplicate invoice constraint to ConflictException', async () => {
    manager.findOne.mockResolvedValue({ id: 'vendor-1', tenantId: 'tenant-123', name: 'Acme Supplies' } as Vendor);
    manager.save.mockRejectedValue({ code: '23505' });

    await expect(service.create(dto)).rejects.toThrow(ConflictException);
  });
});
