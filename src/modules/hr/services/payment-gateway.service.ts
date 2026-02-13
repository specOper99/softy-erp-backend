import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';

@Injectable()
export class MockPaymentGatewayService {
  private readonly logger = new Logger(MockPaymentGatewayService.name);

  /**
   * Simulates a bank transfer payout.
   * In a real scenario, this would call a Stripe/PayPal/Bank API.
   */
  async triggerPayout(details: {
    employeeName: string;
    bankAccount: string;
    amount: number;
    referenceId: string;
  }): Promise<{
    success: boolean;
    transactionReference?: string;
    error?: string;
  }> {
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
  async checkPayoutStatus(referenceId: string): Promise<{
    status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'NOT_FOUND';
    transactionReference?: string;
  }> {
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
