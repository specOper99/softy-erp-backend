import { SetMetadata } from '@nestjs/common';
import type { AppAction, AppSubject } from './ability.factory';

export const CHECK_ABILITY_KEY = 'check_ability';

export interface CheckAbilityMetadata {
  action: AppAction;
  subject: AppSubject;
  errorMessage?: string;
  useRequestResource?: boolean;
}

export const CheckAbility = (
  action: AppAction,
  subject: AppSubject,
  options?: Omit<CheckAbilityMetadata, 'action' | 'subject'>,
) => SetMetadata(CHECK_ABILITY_KEY, { action, subject, ...options } satisfies CheckAbilityMetadata);
