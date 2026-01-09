import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus } from '../enums/booking-status.enum';

interface TransitionResult {
  isValid: boolean;
  errorMessage?: string;
}

type TransitionMap = Record<BookingStatus, BookingStatus[]>;

@Injectable()
export class BookingStateMachineService {
  private readonly allowedTransitions: TransitionMap = {
    [BookingStatus.DRAFT]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    [BookingStatus.CONFIRMED]: [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
    ],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
  };

  canTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
  ): TransitionResult {
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

  validateTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
  ): void {
    const result = this.canTransition(currentStatus, targetStatus);
    if (!result.isValid) {
      throw new BadRequestException(result.errorMessage);
    }
  }

  getAvailableTransitions(currentStatus: BookingStatus): BookingStatus[] {
    return this.allowedTransitions[currentStatus] || [];
  }

  isTerminalState(status: BookingStatus): boolean {
    return (
      status === BookingStatus.COMPLETED || status === BookingStatus.CANCELLED
    );
  }

  canBeCancelled(status: BookingStatus): boolean {
    return this.allowedTransitions[status]?.includes(BookingStatus.CANCELLED);
  }

  canBeCompleted(status: BookingStatus): boolean {
    return this.allowedTransitions[status]?.includes(BookingStatus.COMPLETED);
  }
}
