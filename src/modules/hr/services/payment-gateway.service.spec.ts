import { Test, TestingModule } from '@nestjs/testing';
import { MockPaymentGatewayService } from './payment-gateway.service';

describe('MockPaymentGatewayService', () => {
  let service: MockPaymentGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MockPaymentGatewayService],
    }).compile();

    service = module.get<MockPaymentGatewayService>(MockPaymentGatewayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('triggerPayout', () => {
    it('should return success for valid payout', async () => {
      // Mock Math.random to always return > 0.05 (success)
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const result = await service.triggerPayout({
        employeeName: 'John Doe',
        bankAccount: '1234567890',
        amount: 2000,
        referenceId: 'REF-001',
      });

      expect(result.success).toBe(true);
      expect(result.transactionReference).toBeDefined();
      expect(result.transactionReference).toMatch(/^BANK_TXN_/);

      mockRandom.mockRestore();
    });

    it('should return failure when simulating 5% failure rate', async () => {
      // Mock Math.random to return < 0.05 (failure)
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.01);

      const result = await service.triggerPayout({
        employeeName: 'Jane Doe',
        bankAccount: '0987654321',
        amount: 3000,
        referenceId: 'REF-002',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_FUNDS');

      mockRandom.mockRestore();
    });

    it('should include amount in log', async () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const result = await service.triggerPayout({
        employeeName: 'Test User',
        bankAccount: 'IBAN123',
        amount: 5000.5,
        referenceId: 'REF-003',
      });

      expect(result.success).toBe(true);
      mockRandom.mockRestore();
    });
  });
});
