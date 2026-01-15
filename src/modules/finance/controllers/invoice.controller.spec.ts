import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { createMockInvoice } from '../../../../test/helpers/mock-factories';
import { InvoiceService } from '../services/invoice.service';
import { InvoiceController } from './invoice.controller';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceService: jest.Mocked<InvoiceService>;

  const mockInvoice = createMockInvoice({
    id: 'invoice-123',
    invoiceNumber: 'INV-20240101-1234',
    status: 'DRAFT',
    totalAmount: 1100,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        {
          provide: InvoiceService,
          useValue: {
            createInvoice: jest.fn(),
            getInvoicePdf: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
    invoiceService = module.get(InvoiceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generate', () => {
    it('should generate invoice for booking', async () => {
      invoiceService.createInvoice.mockResolvedValue(mockInvoice as any);

      const result = await controller.generate('booking-123');

      expect(invoiceService.createInvoice).toHaveBeenCalledWith('booking-123');
      expect(result).toEqual(mockInvoice);
    });
  });

  describe('downloadPdf', () => {
    it('should return PDF with correct headers', async () => {
      const mockPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      invoiceService.getInvoicePdf.mockResolvedValue(mockPdfBuffer);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.downloadPdf('invoice-123', mockResponse);

      expect(invoiceService.getInvoicePdf).toHaveBeenCalledWith('invoice-123');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="invoice-invoice-123.pdf"',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Length', mockPdfBuffer.length);
      expect(mockResponse.send).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });
});
