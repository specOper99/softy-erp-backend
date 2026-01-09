import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '../enums/notification.enum';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let preferencesService: jest.Mocked<NotificationPreferencesService>;

  const mockUserId = 'user-1';

  beforeEach(async () => {
    const mockPreferencesService = {
      getPreference: jest.fn(),
      getUserPreferences: jest.fn(),
      updatePreferences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationPreferencesService,
          useValue: mockPreferencesService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    preferencesService = module.get(NotificationPreferencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('shouldSendEmail', () => {
    it('should return true when preference has emailEnabled true', async () => {
      preferencesService.getPreference.mockResolvedValue({
        emailEnabled: true,
        inAppEnabled: true,
      } as any);

      const result = await service.shouldSendEmail(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(true);
    });

    it('should return false when preference has emailEnabled false', async () => {
      preferencesService.getPreference.mockResolvedValue({
        emailEnabled: false,
        inAppEnabled: true,
      } as any);

      const result = await service.shouldSendEmail(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(false);
    });

    it('should return true as default when no preference exists', async () => {
      preferencesService.getPreference.mockResolvedValue(null);

      const result = await service.shouldSendEmail(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(true);
    });
  });

  describe('shouldSendInApp', () => {
    it('should return true when preference has inAppEnabled true', async () => {
      preferencesService.getPreference.mockResolvedValue({
        emailEnabled: true,
        inAppEnabled: true,
      } as any);

      const result = await service.shouldSendInApp(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(true);
    });

    it('should return false when preference has inAppEnabled false', async () => {
      preferencesService.getPreference.mockResolvedValue({
        emailEnabled: true,
        inAppEnabled: false,
      } as any);

      const result = await service.shouldSendInApp(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(false);
    });

    it('should return true as default when no preference exists', async () => {
      preferencesService.getPreference.mockResolvedValue(null);

      const result = await service.shouldSendInApp(
        mockUserId,
        NotificationType.BOOKING_UPDATED,
      );

      expect(result).toBe(true);
    });
  });
});
