import { BookingFinanceEffectsService } from './booking-finance-effects.service';
import { TransactionType } from '../../finance/domain/enums/transaction-type.enum';
import { InvoiceStatus } from '../../finance/domain/entities/invoice.entity';

describe('BookingFinanceEffectsService', () => {
  const financeService = {
    createTransactionWithManager: jest.fn(),
    transferPendingCommission: jest.fn(),
  };

  let service: BookingFinanceEffectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BookingFinanceEffectsService(financeService as never);
  });

  describe('applyConfirmDeposit', () => {
    it('posts remaining deposit and updates booking paid amount', async () => {
      const booking = {
        id: 'b1',
        depositAmount: 100,
        amountPaid: 20,
        client: { name: 'Client' },
        servicePackage: { name: 'Pkg', revenueAccountCode: '4000' },
        derivePaymentStatus: jest.fn().mockReturnValue('DEPOSIT_PAID'),
      };
      financeService.createTransactionWithManager.mockResolvedValue({ id: 'tx-1' });

      const result = await service.applyConfirmDeposit({} as never, booking as never);

      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.INCOME,
          amount: 80,
          category: 'Booking Deposit',
        }),
      );
      expect(booking.amountPaid).toBe(100);
      expect(result.transactionId).toBe('tx-1');
    });

    it('skips when deposit already covered', async () => {
      const booking = {
        id: 'b1',
        depositAmount: 50,
        amountPaid: 50,
        derivePaymentStatus: jest.fn(),
      };

      const result = await service.applyConfirmDeposit({} as never, booking as never);

      expect(financeService.createTransactionWithManager).not.toHaveBeenCalled();
      expect(result.depositTx).toBeNull();
    });
  });

  describe('applyCancelReversal', () => {
    it('nets INCOME minus REFUND for reversal amount', async () => {
      const manager = {
        find: jest.fn().mockResolvedValue([
          { type: TransactionType.INCOME, amount: 200, voidedAt: null },
          { type: TransactionType.REFUND, amount: 50, voidedAt: null },
        ]),
      };
      financeService.createTransactionWithManager.mockResolvedValue({ id: 'rev-1' });

      const reversal = await service.applyCancelReversal(manager as never, 'tenant-1', {
        id: 'b1',
        client: { name: 'Client' },
      } as never);

      expect(financeService.createTransactionWithManager).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          amount: -150,
          category: 'Booking Reversal',
        }),
      );
      expect(reversal).toEqual({ id: 'rev-1' });
    });
  });

  describe('cancelLinkedInvoice', () => {
    it('cancels invoice when present', async () => {
      const invoice = {
        status: InvoiceStatus.PARTIALLY_PAID,
        totalAmount: 100,
        cancel: jest.fn(),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue(invoice),
        save: jest.fn(),
      };

      await service.cancelLinkedInvoice(manager as never, 'tenant-1', 'b1');

      expect(invoice.cancel).toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(invoice);
    });
  });
});
