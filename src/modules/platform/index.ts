/**
 * Platform Module - Barrel exports for easier imports
 */

// Enums
export * from './enums/platform-action.enum';
export * from './enums/platform-permission.enum';
export * from './enums/platform-role.enum';
export * from './enums/tenant-status.enum';

// Entities
export * from './entities/impersonation-session.entity';
export * from './entities/platform-audit-log.entity';
export * from './entities/platform-session.entity';
export * from './entities/platform-user.entity';
export * from './entities/tenant-lifecycle-event.entity';

// Services
export * from './services/email-notification.service';
export * from './services/impersonation.service';
export * from './services/mfa.service';
export * from './services/platform-analytics.service';
export * from './services/platform-audit.service';
export * from './services/platform-auth.service';
export * from './services/platform-security.service';
export * from './services/platform-tenant.service';

// Guards
export * from './guards/platform-permissions.guard';
export * from './guards/require-reason.guard';

// Decorators
export * from './decorators/allow-tenant-bypass.decorator';
export * from './decorators/platform-permissions.decorator';
export * from './decorators/require-reason.decorator';

// DTOs
export * from './dto/billing-management.dto';
export * from './dto/platform-auth.dto';
export * from './dto/security.dto';
export * from './dto/support.dto';
export * from './dto/tenant-management.dto';

// Module
export * from './platform.module';
