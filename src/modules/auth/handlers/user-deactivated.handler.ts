import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserDeactivatedEvent } from '../../users/events/user-deactivated.event';
import { TokenService } from '../services/token.service';

@EventsHandler(UserDeactivatedEvent)
export class UserDeactivatedHandler implements IEventHandler<UserDeactivatedEvent> {
  private readonly logger = new Logger(UserDeactivatedHandler.name);

  constructor(private readonly tokenService: TokenService) {}

  async handle(event: UserDeactivatedEvent): Promise<void> {
    try {
      const revoked = await this.tokenService.revokeAllUserTokens(event.userId);
      this.logger.log(`Revoked ${revoked} refresh tokens for deactivated user ${event.userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to revoke tokens for deactivated user ${event.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
