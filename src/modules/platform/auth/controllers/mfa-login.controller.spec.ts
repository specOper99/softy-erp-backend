import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MfaLoginController } from './mfa-login.controller';
import { PlatformAuthService } from '../services/platform-auth.service';
import type { MFAVerifyLoginDto, PlatformAuthResponseDto } from '../dto';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('MfaLoginController', () => {
  let controller: MfaLoginController;
  let authService: { verifyMfaLogin: jest.Mock };

  beforeEach(async () => {
    authService = {
      verifyMfaLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MfaLoginController],
      providers: [{ provide: PlatformAuthService, useValue: authService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MfaLoginController>(MfaLoginController);
  });

  describe('verifyLogin', () => {
    it('should call platformAuthService.verifyMfaLogin and return the result', async () => {
      const dto: MFAVerifyLoginDto = { tempToken: 'token', code: '123456' };
      const req = {
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as any;
      const expectedResponse: PlatformAuthResponseDto = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 3600,
        user: { id: '1', email: 'test@example.com', fullName: 'Test User', role: 'admin' as any },
      };

      authService.verifyMfaLogin.mockResolvedValue(expectedResponse);

      const result = await controller.verifyLogin(dto, req);

      expect(result).toBe(expectedResponse);
      expect(authService.verifyMfaLogin).toHaveBeenCalledWith('token', '123456', {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      });
    });
  });
});
