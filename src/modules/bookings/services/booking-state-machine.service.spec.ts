import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '../enums/booking-status.enum';
import { BookingStateMachineService } from './booking-state-machine.service';

describe('BookingStateMachineService', () => {
  let service: BookingStateMachineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingStateMachineService],
    }).compile();

    service = module.get<BookingStateMachineService>(BookingStateMachineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canTransition', () => {
    it('should allow DRAFT → CONFIRMED', () => {
      const result = service.canTransition(BookingStatus.DRAFT, BookingStatus.CONFIRMED);
      expect(result.isValid).toBe(true);
    });

    it('should allow DRAFT → CANCELLED', () => {
      const result = service.canTransition(BookingStatus.DRAFT, BookingStatus.CANCELLED);
      expect(result.isValid).toBe(true);
    });

    it('should allow CONFIRMED → COMPLETED', () => {
      const result = service.canTransition(BookingStatus.CONFIRMED, BookingStatus.COMPLETED);
      expect(result.isValid).toBe(true);
    });

    it('should allow CONFIRMED → CANCELLED', () => {
      const result = service.canTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED);
      expect(result.isValid).toBe(true);
    });

    it('should NOT allow same status transition', () => {
      const result = service.canTransition(BookingStatus.DRAFT, BookingStatus.DRAFT);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('already in');
    });

    it('should NOT allow DRAFT → COMPLETED', () => {
      const result = service.canTransition(BookingStatus.DRAFT, BookingStatus.COMPLETED);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Cannot transition');
    });

    it('should NOT allow transitions from terminal states', () => {
      const completedResult = service.canTransition(BookingStatus.COMPLETED, BookingStatus.DRAFT);
      const cancelledResult = service.canTransition(BookingStatus.CANCELLED, BookingStatus.DRAFT);

      expect(completedResult.isValid).toBe(false);
      expect(cancelledResult.isValid).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => service.validateTransition(BookingStatus.DRAFT, BookingStatus.CONFIRMED)).not.toThrow();
    });

    it('should throw BadRequestException for invalid transitions', () => {
      expect(() => service.validateTransition(BookingStatus.DRAFT, BookingStatus.COMPLETED)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return valid transitions for DRAFT', () => {
      const transitions = service.getAvailableTransitions(BookingStatus.DRAFT);
      expect(transitions).toContain(BookingStatus.CONFIRMED);
      expect(transitions).toContain(BookingStatus.CANCELLED);
    });

    it('should return empty array for terminal states', () => {
      expect(service.getAvailableTransitions(BookingStatus.COMPLETED)).toHaveLength(0);
      expect(service.getAvailableTransitions(BookingStatus.CANCELLED)).toHaveLength(0);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for COMPLETED', () => {
      expect(service.isTerminalState(BookingStatus.COMPLETED)).toBe(true);
    });

    it('should return true for CANCELLED', () => {
      expect(service.isTerminalState(BookingStatus.CANCELLED)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(service.isTerminalState(BookingStatus.DRAFT)).toBe(false);
      expect(service.isTerminalState(BookingStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('canBeCancelled', () => {
    it('should return true for DRAFT', () => {
      expect(service.canBeCancelled(BookingStatus.DRAFT)).toBe(true);
    });

    it('should return true for CONFIRMED', () => {
      expect(service.canBeCancelled(BookingStatus.CONFIRMED)).toBe(true);
    });

    it('should return false for COMPLETED', () => {
      expect(service.canBeCancelled(BookingStatus.COMPLETED)).toBe(false);
    });
  });

  describe('canBeCompleted', () => {
    it('should return true for CONFIRMED', () => {
      expect(service.canBeCompleted(BookingStatus.CONFIRMED)).toBe(true);
    });

    it('should return false for DRAFT', () => {
      expect(service.canBeCompleted(BookingStatus.DRAFT)).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('should return false by default (as configured)', () => {
      // Currently approvalRequiredStatuses is empty
      expect(service.requiresApproval(BookingStatus.COMPLETED)).toBe(false);
      expect(service.requiresApproval(BookingStatus.CONFIRMED)).toBe(false);
    });
  });

  describe('executeTransition', () => {
    it('should execute hooks and save callback in correct order', async () => {
      const mockBooking = { id: '123', status: BookingStatus.DRAFT } as Booking;
      const targetStatus = BookingStatus.CONFIRMED;

      const saveCallback = jest.fn().mockResolvedValue({ ...mockBooking, status: targetStatus });

      const hooks: TransitionHook = {
        beforeTransition: jest.fn().mockResolvedValue(undefined),
        afterTransition: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.executeTransition(mockBooking, targetStatus, saveCallback, hooks);

      expect(result.status).toBe(BookingStatus.CONFIRMED);

      // Verify Order: Validate -> Before -> Save -> After
      expect(hooks.beforeTransition).toHaveBeenCalledWith(mockBooking, targetStatus);
      expect(saveCallback).toHaveBeenCalled();
      expect(hooks.afterTransition).toHaveBeenCalledWith(
        expect.objectContaining({ status: BookingStatus.CONFIRMED }),
        BookingStatus.DRAFT,
      );

      // Verify invocation order
      const beforeCall = (hooks.beforeTransition as jest.Mock).mock.invocationCallOrder[0];
      const saveCall = saveCallback.mock.invocationCallOrder[0];
      const afterCall = (hooks.afterTransition as jest.Mock).mock.invocationCallOrder[0];

      expect(beforeCall).toBeLessThan(saveCall);
      expect(saveCall).toBeLessThan(afterCall);
    });

    it('should fail if transition is invalid', async () => {
      const mockBooking = { id: '123', status: BookingStatus.DRAFT } as Booking;
      const invalidStatus = BookingStatus.COMPLETED; // Invalid transition
      const saveCallback = jest.fn();

      await expect(service.executeTransition(mockBooking, invalidStatus, saveCallback)).rejects.toThrow(
        BadRequestException,
      );

      expect(saveCallback).not.toHaveBeenCalled();
    });

    it('should work without hooks', async () => {
      const mockBooking = { id: '123', status: BookingStatus.DRAFT } as Booking;
      const targetStatus = BookingStatus.CONFIRMED;
      const saveCallback = jest.fn().mockResolvedValue({ ...mockBooking, status: targetStatus });

      await service.executeTransition(mockBooking, targetStatus, saveCallback);

      expect(saveCallback).toHaveBeenCalled();
    });
  });
});
