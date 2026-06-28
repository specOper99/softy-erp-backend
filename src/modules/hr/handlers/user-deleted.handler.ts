import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { runGuardedDispatch } from '../../../common/utils/event-dispatch.util';
import { UserDeletedEvent } from '../../users/events/user-deleted.event';
import { HrService } from '../services/hr.service';

@EventsHandler(UserDeletedEvent)
export class UserDeletedHandler implements IEventHandler<UserDeletedEvent> {
  private readonly logger = new Logger(UserDeletedHandler.name);

  constructor(private readonly hrService: HrService) {}

  handle(event: UserDeletedEvent): Promise<void> {
    return runGuardedDispatch(
      this.logger,
      {
        startMessage: `Handling UserDeletedEvent for user: ${event.userId}`,
        failureMessage: `Failed to delete profile for user ${event.userId}`,
      },
      () => this.hrService.softDeleteProfileByUserId(event.userId),
    );
  }
}
