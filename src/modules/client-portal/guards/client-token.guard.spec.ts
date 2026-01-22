import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from '../../bookings/entities/client.entity';
import { ClientAuthService } from '../services/client-auth.service';
import { ClientTokenGuard } from './client-token.guard';

describe('ClientTokenGuard', () => {
  let guard: ClientTokenGuard;
  let clientAuthService: jest.Mocked<ClientAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientTokenGuard,
        {
          provide: ClientAuthService,
          useValue: {
            validateClientToken: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ClientTokenGuard>(ClientTokenGuard);
    clientAuthService = module.get(ClientAuthService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when x-client-token header is present', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'valid-token-123' },
          }),
        }),
      } as unknown as ExecutionContext;

      clientAuthService.validateClientToken.mockResolvedValue({ id: 'client-1' } as Client);
      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('client-portal.token_required');
    });

    it('should throw when token is empty string', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': '' },
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when token is invalid', async () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'invalid-token' },
          }),
        }),
      } as unknown as ExecutionContext;

      clientAuthService.validateClientToken.mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('client-portal.token_invalid');
    });
  });
});
