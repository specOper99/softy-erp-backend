import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../../users/entities/user.entity';
import { NotificationType } from '../enums/notification.enum';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { NotificationPreferencesController } from './notification-preferences.controller';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let preferencesService: jest.Mocked<NotificationPreferencesService>;

  const mockUser: Partial<User> = {
    id: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
  };

  const mockPreference = {
    id: 'pref-1',
    userId: 'user-1',
    notificationType: NotificationType.BOOKING_UPDATED,
    emailEnabled: true,
    inAppEnabled: true,
    frequency: 'immediate',
  };

  beforeEach(async () => {
    const mockPreferencesService = {
      getUserPreferences: jest.fn(),
      updatePreferences: jest.fn(),
      getPreference: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        {
          provide: NotificationPreferencesService,
          useValue: mockPreferencesService,
        },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(NotificationPreferencesController);
    preferencesService = module.get(NotificationPreferencesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserPreferences', () => {
    it('should return user notification preferences', async () => {
      preferencesService.getUserPreferences.mockResolvedValue([mockPreference] as any);

      const result = await controller.getUserPreferences(mockUser as User);

      expect(preferencesService.getUserPreferences).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].notificationType).toBe(NotificationType.BOOKING_UPDATED);
    });

    it('should return empty array when no preferences exist', async () => {
      preferencesService.getUserPreferences.mockResolvedValue([]);

      const result = await controller.getUserPreferences(mockUser as User);

      expect(result).toHaveLength(0);
    });
  });

  describe('updatePreferences', () => {
    it('should update notification preferences', async () => {
      const updates = [
        {
          notificationType: NotificationType.BOOKING_UPDATED,
          emailEnabled: false,
          inAppEnabled: true,
        },
      ];

      const updatedPreference = { ...mockPreference, emailEnabled: false };
      preferencesService.updatePreferences.mockResolvedValue([updatedPreference] as any);

      const result = await controller.updatePreferences(mockUser as User, updates as any);

      expect(preferencesService.updatePreferences).toHaveBeenCalledWith('user-1', updates);
      expect(result).toHaveLength(1);
      expect(result[0].emailEnabled).toBe(false);
    });

    it('should handle multiple updates', async () => {
      const updates = [
        {
          notificationType: NotificationType.BOOKING_UPDATED,
          emailEnabled: true,
        },
        {
          notificationType: NotificationType.TASK_ASSIGNED,
          inAppEnabled: false,
        },
      ];

      preferencesService.updatePreferences.mockResolvedValue([
        {
          ...mockPreference,
          notificationType: NotificationType.BOOKING_UPDATED,
        },
        {
          ...mockPreference,
          notificationType: NotificationType.TASK_ASSIGNED,
        },
      ] as any);

      const result = await controller.updatePreferences(mockUser as User, updates as any);

      expect(result).toHaveLength(2);
    });
  });
});
