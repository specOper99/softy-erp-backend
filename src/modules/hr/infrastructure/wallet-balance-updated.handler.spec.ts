import { WalletBalanceUpdatedHandler } from './wallet-balance-updated.handler';
import { WalletBalanceUpdatedEvent } from '../../finance/domain/events/wallet-balance-updated.event';
import { TenantContextService } from '../../../common/services/tenant-context.service';

describe('WalletBalanceUpdatedHandler', () => {
  const cacheUtils = {
    del: jest.fn().mockResolvedValue(undefined),
    invalidateByPattern: jest.fn().mockResolvedValue(1),
  };

  let handler: WalletBalanceUpdatedHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new WalletBalanceUpdatedHandler(cacheUtils as never);
    jest.spyOn(TenantContextService, 'run').mockImplementation(async (_tenantId, cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('invalidates payroll employee and summary cache keys', async () => {
    const event = new WalletBalanceUpdatedEvent('user-1', 'tenant-1', 100, 150, 'pending', 'commission');

    await handler.handle(event);

    expect(cacheUtils.del).toHaveBeenCalledWith('payroll:employee:user-1');
    expect(cacheUtils.del).toHaveBeenCalledWith('payroll:summary:tenant-1');
    expect(cacheUtils.invalidateByPattern).toHaveBeenCalledWith('payroll:tenant-1:*');
  });
});
