import { Test, TestingModule } from '@nestjs/testing';
import { UserDeactivatedEvent } from '../../users/events/user-deactivated.event';
import { TokenService } from '../services/token.service';
import { UserDeactivatedHandler } from './user-deactivated.handler';

describe('UserDeactivatedHandler', () => {
  let handler: UserDeactivatedHandler;
  let tokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDeactivatedHandler,
        {
          provide: TokenService,
          useValue: {
            revokeAllUserTokens: jest.fn().mockResolvedValue(2),
          },
        },
      ],
    }).compile();

    handler = module.get(UserDeactivatedHandler);
    tokenService = module.get(TokenService);
  });

  it('should revoke all user refresh tokens', async () => {
    await handler.handle(new UserDeactivatedEvent('user-1', 'tenant-1'));
    expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
  });
});
