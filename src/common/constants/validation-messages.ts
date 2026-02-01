/**
 * Validation Messages
 *
 * Centralized location for all validation error messages used across the application.
 * Following i18n naming convention: {module}.{error_type}
 *
 * ## Benefits:
 * - Single source of truth for error messages
 * - Easy to find and update messages
 * - Consistent naming convention
 * - Ready for i18n integration
 *
 * ## Usage:
 * ```typescript
 * import { ValidationMessages } from '@/common/constants/validation-messages';
 *
 * throw new BadRequestException(ValidationMessages.booking.invalidStatus);
 * throw new NotFoundException(ValidationMessages.booking.notFound);
 * ```
 */

export const ValidationMessages = {
  // Common
  common: {
    invalidFileSize: 'common.invalid_file_size',
    repositoryNotProvided: 'common.repository_not_provided',
    crossTenantSaveAttempt: 'common.cross_tenant_save_attempt',
    crossTenantRemoveAttempt: 'common.cross_tenant_remove_attempt',
    unauthorized: 'common.unauthorized',
    forbidden: 'common.forbidden',
    internalError: 'common.internal_error',
  },

  // Auth
  auth: {
    invalidCredentials: 'auth.invalid_credentials',
    userNotFound: 'auth.user_not_found',
    emailAlreadyExists: 'auth.email_already_exists',
    weakPassword: 'auth.weak_password',
    tokenExpired: 'auth.token_expired',
    tokenInvalid: 'auth.token_invalid',
    accountDeactivated: 'auth.account_deactivated',
  },

  // Bookings
  booking: {
    notFound: 'booking.not_found',
    invalidStatus: 'booking.invalid_status',
    invalidDepositPercentage: 'booking.invalid_deposit_percentage',
    invalidTransition: 'booking.invalid_transition',
    alreadyConfirmed: 'booking.already_confirmed',
    alreadyCancelled: 'booking.already_cancelled',
    alreadyCompleted: 'booking.already_completed',
    cannotCancel: 'booking.cannot_cancel',
    maxTasksExceeded: 'booking.max_tasks_exceeded',
    eventDatePast: 'booking.event_date_past',
  },

  // Tasks
  task: {
    notFound: 'task.not_found',
    invalidStatus: 'task.invalid_status',
    alreadyCompleted: 'task.already_completed',
    notAssigned: 'task.not_assigned',
    cannotAssign: 'task.cannot_assign',
    invalidTransition: 'task.invalid_transition',
    noUserAssigned: 'task.no_user_assigned',
  },

  // HR
  hr: {
    profileNotFound: 'hr.profile_not_found',
    profileAlreadyExists: 'hr.profile_already_exists',
    userNotFoundInTenant: 'hr.user_not_found_in_tenant',
    invalidBaseSalary: 'hr.invalid_base_salary',
    invalidHireDate: 'hr.invalid_hire_date',
  },

  // Finance
  finance: {
    transactionNotFound: 'finance.transaction_not_found',
    insufficientBalance: 'finance.insufficient_balance',
    invalidAmount: 'finance.invalid_amount',
    invalidTransactionType: 'finance.invalid_transaction_type',
    cannotDeleteTransaction: 'finance.cannot_delete_transaction',
    reportGenerationFailed: 'finance.report_generation_failed',
  },

  // Clients
  client: {
    notFound: 'client.not_found',
    emailAlreadyExists: 'client.email_already_exists',
    phoneAlreadyExists: 'client.phone_already_exists',
    invalidEmail: 'client.invalid_email',
    invalidPhone: 'client.invalid_phone',
  },

  // Catalog
  catalog: {
    packageNotFound: 'catalog.package_not_found',
    taskTypeNotFound: 'catalog.task_type_not_found',
    packageItemNotFound: 'catalog.package_item_not_found',
    invalidPrice: 'catalog.invalid_price',
    invalidQuantity: 'catalog.invalid_quantity',
  },

  // Media
  media: {
    attachmentNotFound: 'media.attachment_not_found',
    invalidFileType: 'media.invalid_file_type',
    fileTooLarge: 'media.file_too_large',
    uploadFailed: 'media.upload_failed',
    downloadFailed: 'media.download_failed',
  },

  // Users
  user: {
    notFound: 'user.not_found',
    emailAlreadyExists: 'user.email_already_exists',
    invalidRole: 'user.invalid_role',
    cannotDeactivateSelf: 'user.cannot_deactivate_self',
    cannotDeleteSelf: 'user.cannot_delete_self',
    alreadyDeactivated: 'user.already_deactivated',
  },

  // Webhooks
  webhook: {
    notFound: 'webhook.not_found',
    invalidUrl: 'webhook.invalid_url',
    invalidEvent: 'webhook.invalid_event',
    deliveryFailed: 'webhook.delivery_failed',
  },

  // Payroll
  payroll: {
    periodNotFound: 'payroll.period_not_found',
    periodAlreadyProcessed: 'payroll.period_already_processed',
    periodNotFinalized: 'payroll.period_not_finalized',
    invalidDateRange: 'payroll.invalid_date_range',
    noEligibleEmployees: 'payroll.no_eligible_employees',
  },
} as const;

/**
 * Type helper to ensure type safety when using validation messages
 */
export type ValidationMessagePath = string;
