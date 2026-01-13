import { Injectable, Logger } from '@nestjs/common';

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
    if (Math.random() < 0.05) {
      this.logger.warn(`Payout failed for ${details.referenceId}`);
      return { success: false, error: 'INSUFFICIENT_FUNDS' };
    }

    this.logger.log(`Payout successful for ${details.referenceId}`);
    return {
      success: true,
      transactionReference: `BANK_TXN_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    };
  }
}
