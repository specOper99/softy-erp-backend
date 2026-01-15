import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../enums/booking-status.enum';

interface TransitionResult {
  isValid: boolean;
  errorMessage?: string;
}

type TransitionMap = Record<BookingStatus, BookingStatus[]>;

export interface TransitionHook {
  beforeTransition?: (booking: Booking, targetStatus: BookingStatus) => Promise<void>;
  afterTransition?: (booking: Booking, previousStatus: BookingStatus) => Promise<void>;
}

@Injectable()
export class BookingStateMachineService {
  private readonly logger = new Logger(BookingStateMachineService.name);

  private readonly allowedTransitions: TransitionMap = {
    [BookingStatus.DRAFT]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
  };

  /**
   * Statuses that require manager approval to transition INTO.
   * L-05: State Machine Enhancements
   */
  private readonly approvalRequiredStatuses: BookingStatus[] = [
    // Example: Completing a booking might require review
    // BookingStatus.COMPLETED
  ];

  canTransition(currentStatus: BookingStatus, targetStatus: BookingStatus): TransitionResult {
    if (currentStatus === targetStatus) {
      return {
        isValid: false,
        errorMessage: `Booking is already in ${currentStatus} status`,
      };
    }

    const allowedTargets = this.allowedTransitions[currentStatus] || [];
    const isValid = allowedTargets.includes(targetStatus);

    if (!isValid) {
      return {
        isValid: false,
        errorMessage: `Cannot transition from ${currentStatus} to ${targetStatus}. Allowed: ${allowedTargets.join(', ') || 'none'}`,
      };
    }

    return { isValid: true };
  }

  validateTransition(currentStatus: BookingStatus, targetStatus: BookingStatus): void {
    const result = this.canTransition(currentStatus, targetStatus);
    if (!result.isValid) {
      throw new BadRequestException(result.errorMessage);
    }
  }

  getAvailableTransitions(currentStatus: BookingStatus): BookingStatus[] {
    return this.allowedTransitions[currentStatus] || [];
  }

  isTerminalState(status: BookingStatus): boolean {
    return status === BookingStatus.COMPLETED || status === BookingStatus.CANCELLED;
  }

  canBeCancelled(status: BookingStatus): boolean {
    return this.allowedTransitions[status]?.includes(BookingStatus.CANCELLED);
  }

  canBeCompleted(status: BookingStatus): boolean {
    return this.allowedTransitions[status]?.includes(BookingStatus.COMPLETED);
  }

  // ==================== L-05: State Machine Enhancements ====================

  /**
   * Checks if entering a specific status requires manual approval.
   */
  requiresApproval(targetStatus: BookingStatus): boolean {
    return this.approvalRequiredStatuses.includes(targetStatus);
  }

  // ==================== L-07: Transition Hooks ====================

  /**
   * Executes a state transition with hooks.
   * Note: The actual persistence of the status change should be done by the calling service
   * in between the hooks, or passed as a callback.
   *
   * @param booking The booking entity
   * @param targetStatus The desired new status
   * @param saveCallback Function to persist changes (db transaction)
   * @param hooks Optional custom hooks for this specific transition
   */
  async executeTransition(
    booking: Booking,
    targetStatus: BookingStatus,
    saveCallback: () => Promise<Booking>,
    hooks?: TransitionHook,
  ): Promise<Booking> {
    this.validateTransition(booking.status, targetStatus);

    const previousStatus = booking.status;

    // 1. Run Pre-Transition Hook
    if (hooks?.beforeTransition) {
      this.logger.debug(`Running beforeTransition hook for booking ${booking.id}`);
      await hooks.beforeTransition(booking, targetStatus);
    }

    // 2. Persist State Change
    booking.status = targetStatus;
    const updatedBooking = await saveCallback();

    // 3. Run Post-Transition Hook
    if (hooks?.afterTransition) {
      this.logger.debug(`Running afterTransition hook for booking ${booking.id}`);
      await hooks.afterTransition(updatedBooking, previousStatus);
    }

    return updatedBooking;
  }
}
