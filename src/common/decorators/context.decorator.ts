import { SetMetadata } from '@nestjs/common';
import { ContextType } from '../enums/context-type.enum';

export const CONTEXT_TYPE_KEY = 'context_type';

/**
 * Decorator to specify which context (tenant or platform) a route requires
 */
export const RequireContext = (type: ContextType) => SetMetadata(CONTEXT_TYPE_KEY, type);
