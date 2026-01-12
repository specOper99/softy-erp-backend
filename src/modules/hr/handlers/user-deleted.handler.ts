import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserDeletedEvent } from '../../users/events/user-deleted.event';
import { HrService } from '../services/hr.service';

@EventsHandler(UserDeletedEvent)
export class UserDeletedHandler implements IEventHandler<UserDeletedEvent> {
  private readonly logger = new Logger(UserDeletedHandler.name);

  constructor(private readonly hrService: HrService) {}

  async handle(event: UserDeletedEvent) {
    this.logger.log(`Handling UserDeletedEvent for user: ${event.userId}`);

    try {
      await this.hrService.softDeleteProfileByUserId(event.userId);
    } catch (error) {
      this.logger.error(
        `Failed to delete profile for user ${event.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
