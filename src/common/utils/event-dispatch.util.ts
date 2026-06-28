import type { Logger } from '@nestjs/common';
import { toErrorMessage } from './error.util';

type DispatchFn = () => void | Promise<void>;

interface GuardedDispatchMessages {
  startMessage?: string;
  successMessage?: string;
  failureMessage: string;
}

/** Runs an async side-effect with uniform log + swallow-error lifecycle. */
export async function runGuardedDispatch(
  logger: Logger,
  messages: GuardedDispatchMessages,
  dispatch: DispatchFn,
): Promise<void> {
  if (messages.startMessage) logger.log(messages.startMessage);
  try {
    await dispatch();
    if (messages.successMessage) logger.log(messages.successMessage);
  } catch (error) {
    logger.error(`${messages.failureMessage}: ${toErrorMessage(error)}`);
  }
}

export function runWebhookDispatch(
  logger: Logger,
  eventLabel: string,
  entityKind: string,
  entityId: string,
  dispatch: DispatchFn,
): Promise<void> {
  return runGuardedDispatch(
    logger,
    {
      startMessage: `Handling ${eventLabel} for webhooks: ${entityId}`,
      successMessage: `Webhook dispatched for ${eventLabel}: ${entityId}`,
      failureMessage: `Failed to dispatch webhook for ${entityKind} ${entityId}`,
    },
    dispatch,
  );
}

export function runMailDispatch(
  logger: Logger,
  handlingMessage: string,
  entityId: string,
  failureLabel: string,
  dispatch: DispatchFn,
): Promise<void> {
  return runGuardedDispatch(
    logger,
    {
      startMessage: `${handlingMessage}: ${entityId}`,
      failureMessage: `Failed to send ${failureLabel} for ${entityId}`,
    },
    dispatch,
  );
}
