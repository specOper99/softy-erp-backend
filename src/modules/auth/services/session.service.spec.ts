import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeoIpService } from '../../../common/services/geoip.service';
import { MailService } from '../../mail/mail.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

describe('SessionService', () => {
  let service: SessionService;
  let _tokenService: TokenService;
  let _mailService: MailService;
  let _geoIpService: GeoIpService;

  const mockTokenService = {
    getActiveSessions: jest.fn(),
    revokeSession: jest.fn(),
    hashToken: jest.fn((t) => 'hash_' + t),
    revokeOtherSessions: jest.fn(),
    revokeAllUserTokens: jest.fn(),
    findPreviousLoginByUserAgent: jest.fn(),
    getRecentSessions: jest.fn(),
  };

  const mockMailService = {
    queueNewDeviceLogin: jest.fn(),
    queueSuspiciousActivity: jest.fn(),
  };

  const mockGeoIpService = {
    getLocation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: TokenService, useValue: mockTokenService },
        { provide: MailService, useValue: mockMailService },
        { provide: GeoIpService, useValue: mockGeoIpService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    _tokenService = module.get<TokenService>(TokenService);
    _mailService = module.get<MailService>(MailService);
    _geoIpService = module.get<GeoIpService>(GeoIpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getActiveSessions', () => {
    it('should call tokenService', async () => {
      await service.getActiveSessions('u1');
      expect(mockTokenService.getActiveSessions).toHaveBeenCalledWith('u1');
    });
  });

  describe('revokeSession', () => {
    it('should revoke successfully', async () => {
      mockTokenService.revokeSession.mockResolvedValue(1);
      await service.revokeSession('u1', 's1');
      expect(mockTokenService.revokeSession).toHaveBeenCalledWith('u1', 's1');
    });

    it('should throw NotFound if no session affected', async () => {
      mockTokenService.revokeSession.mockResolvedValue(0);
      await expect(service.revokeSession('u1', 's1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeOtherSessions', () => {
    it('should revoke other sessions', async () => {
      mockTokenService.revokeOtherSessions.mockResolvedValue(2);
      const res = await service.revokeOtherSessions('u1', 'token');
      expect(mockTokenService.hashToken).toHaveBeenCalledWith('token');
      expect(mockTokenService.revokeOtherSessions).toHaveBeenCalledWith('u1', 'hash_token');
      expect(res).toBe(2);
    });
  });

  describe('logoutAllSessions', () => {
    it('should logout all', async () => {
      mockTokenService.revokeAllUserTokens.mockResolvedValue(3);
      const res = await service.logoutAllSessions('u1');
      expect(mockTokenService.revokeAllUserTokens).toHaveBeenCalledWith('u1');
      expect(res).toBe(3);
    });
  });

  describe('checkNewDevice', () => {
    it('should detect new device and send email', async () => {
      const longUserAgent = 'a'.repeat(250);
      mockTokenService.findPreviousLoginByUserAgent.mockResolvedValue(null);
      mockGeoIpService.getLocation.mockReturnValue({ city: 'City', country: 'Country' });

      await service.checkNewDevice('u1', longUserAgent, '1.2.3.4', 'test@example.com');

      expect(mockTokenService.findPreviousLoginByUserAgent).toHaveBeenCalledWith('u1', longUserAgent.substring(0, 200));

      expect(mockMailService.queueNewDeviceLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          device: longUserAgent.substring(0, 200),
          location: 'City, Country',
        }),
      );
    });

    it('should not email if previous login exists', async () => {
      const longUserAgent = 'a'.repeat(250);
      mockTokenService.findPreviousLoginByUserAgent.mockResolvedValue({ id: 's1' });
      await service.checkNewDevice('u1', longUserAgent, '1.2.3.4');

      expect(mockTokenService.findPreviousLoginByUserAgent).toHaveBeenCalledWith('u1', longUserAgent.substring(0, 200));
      expect(mockMailService.queueNewDeviceLogin).not.toHaveBeenCalled();
    });
  });

  describe('checkSuspiciousActivity', () => {
    it('should detect impossible travel', async () => {
      mockGeoIpService.getLocation.mockImplementation((ip) => {
        if (ip === '1.1.1.1') return { country: 'US', city: 'NY' };
        if (ip === '2.2.2.2') return { country: 'UK', city: 'London' };
        return { country: 'Unknown' };
      });

      mockTokenService.getRecentSessions.mockResolvedValue([{ ipAddress: '2.2.2.2' } as RefreshToken]);

      await service.checkSuspiciousActivity('u1', '1.1.1.1', 'test@example.com');

      expect(mockMailService.queueSuspiciousActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'IMPOSSIBLE_TRAVEL',
          email: 'test@example.com',
        }),
      );
    });

    it('should ignore local IPs', async () => {
      mockGeoIpService.getLocation.mockReturnValue({ country: 'Localhost' });
      await service.checkSuspiciousActivity('u1', '127.0.0.1');
      expect(mockTokenService.getRecentSessions).not.toHaveBeenCalled();
    });
  });
});
