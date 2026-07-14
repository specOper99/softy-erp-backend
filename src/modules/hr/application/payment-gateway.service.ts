import { Injectable, Logger } from '@nestjs/common';
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

/**
 * Port for bank/ACH/provider payouts used by payroll relay + reconciliation.
 *
 * Prod: do not register `MockPaymentGatewayService`. Implement this interface
 * for a chosen provider (credentials/SDK TBD — no Stripe payout wiring in-tree;
 * tenant `stripe_*` columns are SaaS billing only).
 *
 * Env:
 * - `PAYOUT_GATEWAY=mock` (default) — allowed only when `NODE_ENV` ≠ `production`
 * - Production must provide a real implementation before enabling payroll payouts
 *
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

function isMockPayoutAllowed(): boolean {
  // Explicit allow-list for non-prod; production always rejects mock gateway.
  if (isProductionRuntime()) return false;
  const gateway = (process.env.PAYOUT_GATEWAY ?? 'mock').toLowerCase();
  return gateway === 'mock';
}

@Injectable()
export class MockPaymentGatewayService implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGatewayService.name);

  constructor() {
    if (!isMockPayoutAllowed()) {
      throw new Error(
        'MockPaymentGatewayService is not allowed in production. Set a real PAYOUT_GATEWAY implementation before enabling payroll payouts.',
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
    if (!isMockPayoutAllowed()) {
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
    if (!isMockPayoutAllowed()) {
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
