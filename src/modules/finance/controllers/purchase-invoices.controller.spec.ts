import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseInvoicesService } from '../services/purchase-invoices.service';

describe('PurchaseInvoicesController', () => {
  let controller: PurchaseInvoicesController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'pi-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ id: 'pi-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseInvoicesController],
      providers: [
        {
          provide: PurchaseInvoicesService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<PurchaseInvoicesController>(PurchaseInvoicesController);
  });

  it('wires create to service', async () => {
    const dto = {
      vendorId: 'vendor-1',
      invoiceNumber: 'PI-2026-0001',
      invoiceDate: '2026-02-18T00:00:00.000Z',
      totalAmount: 500,
    };

    await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('wires findAll to service', async () => {
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });

  it('wires findOne to service', async () => {
    await controller.findOne('pi-1');
    expect(service.findById).toHaveBeenCalledWith('pi-1');
  });
});
