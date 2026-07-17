import { Injectable, Logger, type Provider } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';

/** Nest DI token for payroll/finance payout gateway implementations. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type PayoutTriggerResult = {
  success: boolean;
  transactionReference?: string;
  error?: string;
};

export type PayoutStatusResult = {
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'NOT_FOUND';
  transactionReference?: string;
};

export type PayoutGatewayMode = 'mock' | 'disabled';

/**
 * Port for bank/ACH/provider payouts used by payroll relay + reconciliation.
 *
 * Env `PAYOUT_GATEWAY`:
 * - `mock` (default outside production) — simulated bank; blocked when `NODE_ENV=production`
 * - `disabled` (default in production) — boots safely; trigger/status refuse real money movement
 *
 * Production must swap in a real `PaymentGateway` implementation before enabling payroll payouts.
 * See `docs/ops/OPERATOR_CHECKLIST.md` §2b.
 */
export interface PaymentGateway {
  triggerPayout(details: {
    employeeName: string;
    bankAccount: string;
    amount: number;
    referenceId: string;
  }): Promise<PayoutTriggerResult>;

  checkPayoutStatus(referenceId: string): Promise<PayoutStatusResult>;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Resolve configured gateway mode (production defaults to disabled, not mock). */
export function resolvePayoutGatewayMode(): PayoutGatewayMode {
  const raw = (process.env.PAYOUT_GATEWAY ?? '').trim().toLowerCase();
  if (raw === 'mock' || raw === 'disabled') {
    return raw;
  }
  return isProductionRuntime() ? 'disabled' : 'mock';
}

/**
 * Nest providers for `PAYMENT_GATEWAY` + concrete class (tests may inject the class).
 * Production never constructs `MockPaymentGatewayService`.
 */
export function createPaymentGatewayProviders(): Provider[] {
  const mode = resolvePayoutGatewayMode();
  if (mode === 'mock') {
    if (isProductionRuntime()) {
      throw new Error(
        'PAYOUT_GATEWAY=mock is not allowed in production. Use PAYOUT_GATEWAY=disabled or a real gateway.',
      );
    }
    return [MockPaymentGatewayService, { provide: PAYMENT_GATEWAY, useExisting: MockPaymentGatewayService }];
  }
  return [DisabledPaymentGatewayService, { provide: PAYMENT_GATEWAY, useExisting: DisabledPaymentGatewayService }];
}

/**
 * Safe production stub: app boots, payouts stay unprocessed until a real gateway is wired.
 */
@Injectable()
export class DisabledPaymentGatewayService implements PaymentGateway {
  private readonly logger = new Logger(DisabledPaymentGatewayService.name);

  constructor() {
    this.logger.warn(
      'Payout gateway disabled (PAYOUT_GATEWAY=disabled). Payroll payouts will not be sent until a real gateway is configured.',
    );
  }

  async triggerPayout(details: {
    employeeName: string;
    bankAccount: string;
    amount: number;
    referenceId: string;
  }): Promise<PayoutTriggerResult> {
    this.logger.warn(`Refusing payout ${details.referenceId} ($${details.amount}) — gateway disabled`);
    return { success: false, error: 'PAYOUT_GATEWAY_DISABLED' };
  }

  async checkPayoutStatus(referenceId: string): Promise<PayoutStatusResult> {
    this.logger.debug(`Status check skipped for ${referenceId} — gateway disabled`);
    return { status: 'NOT_FOUND' };
  }
}

@Injectable()
export class MockPaymentGatewayService implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGatewayService.name);

  constructor() {
    if (isProductionRuntime() || resolvePayoutGatewayMode() !== 'mock') {
      throw new Error(
        'MockPaymentGatewayService is not allowed in production. Set PAYOUT_GATEWAY=disabled or a real implementation before enabling payroll payouts.',
      );
    }
  }

  /**
   * Simulates a bank transfer payout.
   * Replace via `PAYMENT_GATEWAY` provider with a real bank/ACH adapter in prod.
   */
  async triggerPayout(details: {
    employeeName: string;
    bankAccount: string;
    amount: number;
    referenceId: string;
  }): Promise<PayoutTriggerResult> {
    if (isProductionRuntime() || resolvePayoutGatewayMode() !== 'mock') {
      throw new Error('Mock payout gateway blocked in production');
    }

    this.logger.log(`Triggering payout of $${details.amount} to ${details.employeeName} (${details.bankAccount})`);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simulate 5% failure rate for testing FAILED status
    if (this.getFailureRoll() < 5) {
      this.logger.warn(`Payout failed for ${details.referenceId}`);
      return { success: false, error: 'INSUFFICIENT_FUNDS' };
    }

    this.logger.log(`Payout successful for ${details.referenceId}`);
    return {
      success: true,
      transactionReference: `BANK_TXN_${this.getReferenceSuffix()}`,
    };
  }

  /**
   * Simulates checking the status of a payout.
   */
  async checkPayoutStatus(referenceId: string): Promise<PayoutStatusResult> {
    if (isProductionRuntime() || resolvePayoutGatewayMode() !== 'mock') {
      throw new Error('Mock payout gateway blocked in production');
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    // For simulation, we'll assume if it exists it's completed, unless referenceId implies otherwise
    if (referenceId.includes('FAIL')) {
      return { status: 'FAILED' };
    }
    if (referenceId.includes('PENDING')) {
      return { status: 'PENDING' };
    }

    return {
      status: 'COMPLETED',
      transactionReference: `BANK_TXN_CHECK_${this.getReferenceSuffix()}`,
    };
  }

  protected getFailureRoll(): number {
    return randomInt(0, 100);
  }

  protected getReferenceSuffix(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }
}
