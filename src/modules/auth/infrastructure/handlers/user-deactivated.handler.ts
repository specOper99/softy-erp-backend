import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { runGuardedDispatch } from '../../../../common/utils/event-dispatch.util';
import { UserDeactivatedEvent } from '../../../users/domain/events/user-deactivated.event';
import { TokenService } from '../../application/token.service';

@EventsHandler(UserDeactivatedEvent)
export class UserDeactivatedHandler implements IEventHandler<UserDeactivatedEvent> {
  private readonly logger = new Logger(UserDeactivatedHandler.name);

  constructor(private readonly tokenService: TokenService) {}

  handle(event: UserDeactivatedEvent): Promise<void> {
    return runGuardedDispatch(
      this.logger,
      {
        failureMessage: `Failed to revoke tokens for deactivated user ${event.userId}`,
      },
      async () => {
        const revoked = await this.tokenService.revokeAllUserTokens(event.userId);
        this.logger.log(`Revoked ${revoked} refresh tokens for deactivated user ${event.userId}`);
      },
    );
  }
}
