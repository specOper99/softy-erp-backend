import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Client } from '../../bookings/entities/client.entity';
import { MailService } from '../../mail/mail.service';
import { ClientAuthService } from './client-auth.service';

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let _clientRepository: ReturnType<typeof jest.fn>;
  let _mailService: MailService;

  const mockClient = {
    id: 'client-uuid-123',
    name: 'Test Client',
    email: 'test@example.com',
    accessToken: 'valid-token',
    accessTokenExpiry: new Date(Date.now() + 86400000), // 24 hours from now
    isAccessTokenValid: jest.fn().mockReturnValue(true),
  };

  const mockClientRepository = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((client) => Promise.resolve(client)),
  };

  const mockMailService = {
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        {
          provide: getRepositoryToken(Client),
          useValue: mockClientRepository,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    service = module.get<ClientAuthService>(ClientAuthService);
    _clientRepository = module.get(getRepositoryToken(Client));
    _mailService = module.get<MailService>(MailService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should return message when client exists', async () => {
      mockClientRepository.findOne.mockResolvedValue({ ...mockClient });

      const result = await service.requestMagicLink('test@example.com');

      expect(result.message).toBe(
        'If an account exists, a magic link has been sent.',
      );
      expect(mockClientRepository.save).toHaveBeenCalled();
      expect(mockMailService.sendMagicLink).toHaveBeenCalled();
    });

    it('should return same message when client does not exist (security)', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      const result = await service.requestMagicLink('nonexistent@example.com');

      expect(result.message).toBe(
        'If an account exists, a magic link has been sent.',
      );
      expect(mockClientRepository.save).not.toHaveBeenCalled();
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should save token and expiry to client', async () => {
      const clientCopy = { ...mockClient };
      mockClientRepository.findOne.mockResolvedValue(clientCopy);

      await service.requestMagicLink('test@example.com');

      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String),
          accessTokenExpiry: expect.any(Date),
        }),
      );
    });

    it('should send magic link email with correct parameters', async () => {
      mockClientRepository.findOne.mockResolvedValue({ ...mockClient });

      await service.requestMagicLink('test@example.com');

      expect(mockMailService.sendMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          clientEmail: 'test@example.com',
          clientName: 'Test Client',
          token: expect.any(String),
          expiresInHours: 24,
        }),
      );
    });
  });

  describe('verifyMagicLink', () => {
    it('should return access token and client for valid token', async () => {
      mockClientRepository.findOne.mockResolvedValue({ ...mockClient });

      const result = await service.verifyMagicLink('valid-token');

      expect(result.accessToken).toBe('valid-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.client).toBeDefined();
    });

    it('should throw NotFoundException for non-existent token', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyMagicLink('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const expiredClient = {
        ...mockClient,
        isAccessTokenValid: jest.fn().mockReturnValue(false),
      };
      mockClientRepository.findOne.mockResolvedValue(expiredClient);

      await expect(service.verifyMagicLink('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should extend token expiry on successful verification', async () => {
      mockClientRepository.findOne.mockResolvedValue({ ...mockClient });

      const result = await service.verifyMagicLink('valid-token');

      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockClientRepository.save).toHaveBeenCalled();
    });
  });

  describe('validateClientToken', () => {
    it('should return client for valid token', async () => {
      mockClientRepository.findOne.mockResolvedValue({ ...mockClient });

      const result = await service.validateClientToken('valid-token');

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
    });

    it('should return null for non-existent token', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      const result = await service.validateClientToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expiredClient = {
        ...mockClient,
        isAccessTokenValid: jest.fn().mockReturnValue(false),
      };
      mockClientRepository.findOne.mockResolvedValue(expiredClient);

      const result = await service.validateClientToken('expired-token');

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear access token for existing client', async () => {
      const clientCopy = { ...mockClient };
      mockClientRepository.findOne.mockResolvedValue(clientCopy);

      await service.logout('valid-token');

      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: '',
        }),
      );
    });

    it('should do nothing for non-existent token', async () => {
      mockClientRepository.findOne.mockResolvedValue(null);

      await service.logout('invalid-token');

      expect(mockClientRepository.save).not.toHaveBeenCalled();
    });

    it('should set token expiry to epoch', async () => {
      const clientCopy = { ...mockClient };
      mockClientRepository.findOne.mockResolvedValue(clientCopy);

      await service.logout('valid-token');

      expect(mockClientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessTokenExpiry: new Date(0),
        }),
      );
    });
  });
});
