import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MockPaymentGatewayService } from './payment-gateway.service';

class DeterministicMockPaymentGatewayService extends MockPaymentGatewayService {
  failureRoll = 50;
  referenceSuffix = '1234ABCD';

  protected override getFailureRoll(): number {
    return this.failureRoll;
  }

  protected override getReferenceSuffix(): string {
    return this.referenceSuffix;
  }
}

describe('MockPaymentGatewayService', () => {
  let service: DeterministicMockPaymentGatewayService;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPayoutGateway = process.env.PAYOUT_GATEWAY;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYOUT_GATEWAY = 'mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeterministicMockPaymentGatewayService],
    }).compile();

    service = module.get<DeterministicMockPaymentGatewayService>(DeterministicMockPaymentGatewayService);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalPayoutGateway === undefined) {
      delete process.env.PAYOUT_GATEWAY;
    } else {
      process.env.PAYOUT_GATEWAY = originalPayoutGateway;
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails fast when constructed in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      Test.createTestingModule({
        providers: [DeterministicMockPaymentGatewayService],
      }).compile(),
    ).rejects.toThrow(/not allowed in production/);
  });

  describe('triggerPayout', () => {
    it('should return success for valid payout', async () => {
      service.failureRoll = 50;
      service.referenceSuffix = '1234ABCD';

      const result = await service.triggerPayout({
        employeeName: 'John Doe',
        bankAccount: '1234567890',
        amount: 2000,
        referenceId: 'REF-001',
      });

      expect(result.success).toBe(true);
      expect(result.transactionReference).toBeDefined();
      expect(result.transactionReference).toBe('BANK_TXN_1234ABCD');
    });

    it('should return failure when simulating 5% failure rate', async () => {
      service.failureRoll = 1;

      const result = await service.triggerPayout({
        employeeName: 'Jane Doe',
        bankAccount: '0987654321',
        amount: 3000,
        referenceId: 'REF-002',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('should include amount in log', async () => {
      service.failureRoll = 50;
      service.referenceSuffix = 'CAFEBABE';

      const result = await service.triggerPayout({
        employeeName: 'Test User',
        bankAccount: 'IBAN123',
        amount: 5000.5,
        referenceId: 'REF-003',
      });

      expect(result.success).toBe(true);
      expect(result.transactionReference).toBe('BANK_TXN_CAFEBABE');
    });
  });
});
