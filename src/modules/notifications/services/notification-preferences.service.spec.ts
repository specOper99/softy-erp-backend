import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationFrequency, NotificationType } from '../enums/notification.enum';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let preferenceRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const mockUserId = 'user-1';

  const mockPreference: Partial<NotificationPreference> = {
    id: 'pref-1',
    userId: mockUserId,
    notificationType: NotificationType.BOOKING_UPDATED,
    emailEnabled: true,
    inAppEnabled: true,
    frequency: NotificationFrequency.IMMEDIATE,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    preferenceRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: preferenceRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(NotificationPreferencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserPreferences', () => {
    it('should return user preferences', async () => {
      preferenceRepository.find.mockResolvedValue([mockPreference]);

      const result = await service.getUserPreferences(mockUserId);

      expect(preferenceRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(result).toHaveLength(1);
      expect(result[0].notificationType).toBe(NotificationType.BOOKING_UPDATED);
    });

    it('should return empty array when no preferences exist', async () => {
      preferenceRepository.find.mockResolvedValue([]);

      const result = await service.getUserPreferences(mockUserId);

      expect(result).toHaveLength(0);
    });
  });

  describe('updatePreferences', () => {
    it('should create new preference if not exists', async () => {
      const newPref = { ...mockPreference };
      preferenceRepository.findOne.mockResolvedValue(null);
      preferenceRepository.create.mockReturnValue(newPref);
      preferenceRepository.save.mockResolvedValue(newPref);

      const updates = [
        {
          notificationType: NotificationType.BOOKING_UPDATED,
          emailEnabled: true,
          inAppEnabled: false,
        },
      ];

      const result = await service.updatePreferences(mockUserId, updates);

      expect(preferenceRepository.create).toHaveBeenCalled();
      expect(preferenceRepository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should update existing preference', async () => {
      const existingPref = { ...mockPreference };
      preferenceRepository.findOne.mockResolvedValue(existingPref);
      preferenceRepository.save.mockResolvedValue({
        ...existingPref,
        emailEnabled: false,
      });

      const updates = [
        {
          notificationType: NotificationType.BOOKING_UPDATED,
          emailEnabled: false,
        },
      ];

      const result = await service.updatePreferences(mockUserId, updates);

      expect(preferenceRepository.create).not.toHaveBeenCalled();
      expect(result[0].emailEnabled).toBe(false);
    });

    it('should handle multiple updates', async () => {
      preferenceRepository.findOne.mockResolvedValue(null);
      preferenceRepository.create.mockImplementation((data) => data);
      preferenceRepository.save.mockImplementation((data) => Promise.resolve(data));

      const updates = [
        {
          notificationType: NotificationType.BOOKING_UPDATED,
          emailEnabled: true,
        },
        {
          notificationType: NotificationType.TASK_ASSIGNED,
          emailEnabled: false,
        },
      ];

      const result = await service.updatePreferences(mockUserId, updates);

      expect(result).toHaveLength(2);
      expect(preferenceRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPreference', () => {
    it('should return a specific preference', async () => {
      preferenceRepository.findOne.mockResolvedValue(mockPreference);

      const result = await service.getPreference(mockUserId, NotificationType.BOOKING_UPDATED);

      expect(preferenceRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          notificationType: NotificationType.BOOKING_UPDATED,
        },
      });
      expect(result?.notificationType).toBe(NotificationType.BOOKING_UPDATED);
    });

    it('should return null when preference not found', async () => {
      preferenceRepository.findOne.mockResolvedValue(null);

      const result = await service.getPreference(mockUserId, NotificationType.BOOKING_UPDATED);

      expect(result).toBeNull();
    });
  });
});
