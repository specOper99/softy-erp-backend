import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientTokenGuard } from './client-token.guard';

describe('ClientTokenGuard', () => {
  let guard: ClientTokenGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientTokenGuard],
    }).compile();

    guard = module.get<ClientTokenGuard>(ClientTokenGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow when x-client-token header is present', () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': 'valid-token-123' },
          }),
        }),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when token is missing', () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
      expect(() => guard.canActivate(mockContext)).toThrow(
        'client-portal.token_required',
      );
    });

    it('should throw when token is empty string', () => {
      const mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => ({
            headers: { 'x-client-token': '' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
