import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TicketPriority } from './ticketing.interface';
import { TicketingService } from './ticketing.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TicketingService', () => {
  let service: TicketingService;
  let _configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'TICKETING_WEBHOOK_URL') return 'https://example.com/webhook';
      if (key === 'TICKETING_WEBHOOK_TIMEOUT_MS') return 1000;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'ticket-123' }),
      status: 200,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TicketingService>(TicketingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('should create a ticket successfully', async () => {
      const ticketId = await service.createTicket({
        title: 'Test Issue',
        description: 'Test Description',
        priority: TicketPriority.HIGH,
      });

      expect(ticketId).toBe('ticket-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test Issue'),
        }),
      );
    });

    it('should handle disabled service', async () => {
      mockConfigService.get.mockReturnValueOnce(null); // No URL
      // Re-create service to pick up new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TicketingService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();
      const disabledService = module.get<TicketingService>(TicketingService);

      const result = await disabledService.createTicket({
        title: 'Test',
        description: 'Desc',
        priority: TicketPriority.LOW,
      });

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        service.createTicket({
          title: 'Test',
          description: 'Desc',
          priority: TicketPriority.LOW,
        }),
      ).rejects.toThrow('Network error');
    });

    it('should handle non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(
        service.createTicket({
          title: 'Test',
          description: 'Desc',
          priority: TicketPriority.LOW,
        }),
      ).rejects.toThrow('Failed to create ticket: 400 Bad Request');
    });

    it('should reject non-https URLs', async () => {
      // We need to re-init service with http url
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'TICKETING_WEBHOOK_URL') return 'http://example.com/webhook';
        return null;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TicketingService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();
      const httpService = module.get<TicketingService>(TicketingService);

      await expect(
        httpService.createTicket({
          title: 'Test',
          description: 'Desc',
          priority: TicketPriority.LOW,
        }),
      ).rejects.toThrow('Ticketing webhook protocol must be https');
    });
  });
});
