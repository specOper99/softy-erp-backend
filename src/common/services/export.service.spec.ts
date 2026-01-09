import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportService],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCSV', () => {
    it('should generate CSV from data array', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];

      const result = service.generateCSV(data);

      expect(result).toContain('name');
      expect(result).toContain('age');
      expect(result).toContain('John');
      expect(result).toContain('Jane');
      expect(result).toContain('30');
      expect(result).toContain('25');
    });

    it('should return empty string for empty array', () => {
      const result = service.generateCSV([]);
      expect(result).toBe('');
    });

    it('should return empty string for null data', () => {
      const result = service.generateCSV(null as any);
      expect(result).toBe('');
    });

    it('should use custom fields when provided', () => {
      const data = [
        { name: 'John', age: 30, email: 'john@test.com' },
        { name: 'Jane', age: 25, email: 'jane@test.com' },
      ];

      const result = service.generateCSV(data, ['name', 'email']);

      expect(result).toContain('name');
      expect(result).toContain('email');
      expect(result).toContain('John');
      expect(result).toContain('john@test.com');
    });
  });

  describe('streamCSV', () => {
    it('should stream CSV with proper headers', () => {
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      const data = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ];

      service.streamCSV(mockResponse, data, 'export.csv');

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="export.csv"',
      );
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should stream empty CSV for empty data', () => {
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      service.streamCSV(mockResponse, [], 'empty.csv');

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.send).toHaveBeenCalledWith('');
    });

    it('should use custom fields when provided', () => {
      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      const data = [{ id: 1, name: 'Item', price: 100 }];

      service.streamCSV(mockResponse, data, 'custom.csv', ['id', 'price']);

      expect(mockResponse.send).toHaveBeenCalled();
      const csvContent = (mockResponse.send as jest.Mock).mock.calls[0][0];
      expect(csvContent).toContain('id');
      expect(csvContent).toContain('price');
    });
  });
});
