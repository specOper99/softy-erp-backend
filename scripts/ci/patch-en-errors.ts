/**
 * Deep-merge additional API error strings into en.json (run sync:i18n-placeholders after).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const TRANSLATIONS_DIR = path.join(__dirname, '../../src/common/i18n/translations');
const EN_DIR = path.join(TRANSLATIONS_DIR, 'en');

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] !== undefined &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      base[k] = v;
    }
  }
}

/** New or overridden leaf messages for API errors */
const PATCH: Record<string, unknown> = {
  common: {
    unauthorized_plain: 'Unauthorized',
    authentication_required: 'Authentication required',
    invalid_resource_id: 'Invalid resource identifier',
    too_many_requests: 'Too many requests',
    too_many_requests_blocked: 'Too many requests. Blocked for {seconds} seconds.',
    field_staff_own_records: 'Field staff can only access their own records',
    not_allowed: 'Not allowed',
    user_context_required: 'User context is required',
  },
  auth: {
    invalid_session: 'Invalid session',
    invalid_refresh_token: 'Invalid refresh token',
    invalid_mfa_code: 'Invalid MFA code',
    invalid_or_expired_token: 'Invalid or expired token',
    user_not_found_or_inactive: 'User not found or inactive',
    account_deactivated: 'Account is deactivated',
    refresh_token_expired_or_revoked: 'Refresh token expired or revoked',
    invalid_token_tenant: 'Invalid token tenant',
    invalid_verification_token: 'Invalid verification token',
    verification_token_expired: 'Verification token has expired',
    mfa_session_expired: 'MFA session expired or invalid. Please login again.',
    mfa_required_enable: 'MFA is required for this action. Please enable MFA in your account settings.',
    invalid_reset_token: 'Invalid or expired reset token',
    session_not_found_or_revoked: 'Session not found or already revoked',
    account_locked_seconds: 'Account temporarily locked. Try again in {seconds} seconds.',
    account_locked_until: 'Account locked until {until}',
    session_expired_or_revoked: 'Session expired or revoked',
    invalid_platform_token: 'Invalid platform token',
    tenant_credentials_required: 'Tenant credentials required for this operation',
    platform_credentials_required: 'Platform credentials required for this operation',
    account_suspended: 'Account suspended',
    ip_not_allowed: 'IP not allowed',
    mfa_not_enabled: 'MFA not enabled',
    user_inactive: 'User inactive',
    invalid_token_audience: 'Invalid token audience',
    session_revoked: 'Session revoked',
    session_expired: 'Session expired',
    mfa_required: 'MFA required',
    incorrect_password_mfa_disable: 'Incorrect password. MFA cannot be disabled.',
    refresh_token_body_required: 'refreshToken is required unless allSessions=true',
  },
  tenants: {
    not_found: 'Tenant not found',
    not_found_by_id: 'Tenant with ID {id} was not found',
    not_found_by_slug: 'Tenant with slug {slug} was not found',
    slug_taken: 'Tenant slug is already taken',
    tenant_exists_name_slug: 'Tenant with this name or slug already exists',
    creation_not_supported: 'Tenant creation is not supported via API',
    deletion_not_supported: 'Tenant deletion is not supported via API',
    cross_tenant_forbidden: 'Cross-tenant access is forbidden',
    subscription_active_exists: 'Tenant already has an active subscription',
    subscription_none: 'No subscription found for tenant',
    suspended_already: 'Tenant is already suspended',
    active_already: 'Tenant is already active',
    upgrade_required: 'Upgrade to {plan} to access this feature.',
    quota_exceeded: 'Quota exceeded for {resourceType}. Limit: {limit}, Current: {currentUsage}',
  },
  platform: {
    tenant_not_found: 'Tenant with ID {tenantId} was not found',
    user_not_found_in_tenant: 'User {userId} was not found in tenant {tenantId}',
    impersonation_session_exists: 'An active impersonation session already exists for this user',
    impersonation_not_found: 'Impersonation session not found',
    impersonation_session_ended: 'Session is already ended',
    impersonation_end_own_only: 'You can only end your own impersonation sessions',
    ip_cidr_invalid: 'Invalid IP or CIDR format: {value}',
    permissions_missing: 'Missing required permissions: {permissions}',
    role_required: 'Platform role required',
    reason_required: 'A detailed reason (minimum 10 characters) is required for this operation',
    end_time_before_start: 'End time cannot be earlier than start time',
  },
  billing: {
    subscription_none_for_tenant: 'No subscription found for tenant',
  },
  booking: {
    reject_draft_only: 'Only DRAFT bookings can be rejected',
    listing_not_found: 'Listing not found',
  },
  bookings: {
    not_found_by_id: 'Booking with ID {id} was not found',
  },
  catalog: {
    package_in_use: 'Package is in use and cannot be deleted',
    service_package_not_found: 'Service package with ID {id} was not found',
  },
  finance: {
    invoice_not_found: 'Invoice with ID {id} was not found',
    transaction_not_found: 'Transaction with ID {id} was not found',
    recurring_not_found: 'Recurring transaction not found',
  },
  invoice: {
    booking_not_found: 'Booking with ID {bookingId} was not found',
  },
  tasks: {
    not_found_by_id: 'Task with ID {id} was not found',
    parent_not_found: 'Parent task with ID {id} was not found',
    assignee_not_found_for_user: 'Task assignee not found for user {userId}',
    cannot_be_own_parent: 'A task cannot be its own parent',
    reassignment_use_assign: 'Task reassignment must use the assign endpoint',
    status_use_endpoints: 'Status updates must use dedicated endpoints (start/complete)',
    commission_snapshot_positive: 'commissionSnapshot must be greater than 0',
    assignees_forbidden: 'Not allowed to read this task assignees list',
    user_not_found_in_tenant: 'User not found in tenant',
    client_data_missing: 'Client data is missing for booking {bookingId}',
    cannot_start_status: 'Cannot start task: current status is {status}',
    already_completed: 'Task is already completed',
    complete_no_assignee: 'Cannot complete task: no user assigned',
    not_assigned: 'Task is not assigned',
    modify_forbidden: 'Not allowed to modify this task',
    assignee_already_exists: 'This user is already assigned to the task',
  },
  task: {
    not_found_plain: 'Task not found',
  },
  time_entries: {
    not_found: 'Time entry not found',
    active_timer: 'You have an active timer. Please stop it first.',
    timer_not_running: 'Timer is not running',
    update_forbidden: 'Not allowed to update this time entry',
  },
  hr: {
    unsupported_studio_role: 'Unsupported staff role for studio tenant',
    user_or_profile_exists: 'User or profile already exists',
    profile_exists_for_user: 'Profile already exists for user {userId}',
    attendance_self_only_create: 'Field staff can only create attendance records for themselves',
    attendance_invalid_user_id: 'Invalid userId',
    attendance_self_only_view: 'Field staff can only view their own attendance records',
    attendance_duplicate_day: 'Attendance record for this user and date already exists',
  },
  client_portal: {
    package_not_found: 'Package not found',
    invalid_date_format_hint: 'Invalid date format. Use YYYY-MM-DD',
    review_completed_only: 'Can only review completed bookings',
    review_already_submitted: 'You have already reviewed this booking',
    tenant_slug_required_param: 'tenantSlug is required',
    date_format_yyyy_mm_dd: 'Date format must be YYYY-MM-DD',
    availability_range_invalid: 'Invalid availability date range',
    tenant_slug_required_body: 'Tenant slug is required',
    booking_cancel_status: 'Booking cannot be cancelled in its current status',
    slot_fully_booked: 'Selected time slot is fully booked',
    min_notice_hours: 'Booking requires at least {hours} hours notice',
    client_not_found: 'Client not found',
  },
  privacy: {
    pending_request_exists: 'A pending {type} request already exists',
    request_not_found: 'Privacy request not found',
    cancel_pending_only: 'Only pending requests can be cancelled',
    invalid_user_id_format: 'Invalid user ID format',
    invalid_file_path: 'Invalid file path',
    invalid_request_type: 'Invalid request type',
    consent_grant_required: 'User must grant {type} consent to proceed',
  },
  consent: {
    grant_required: 'User must grant {type} consent to proceed',
  },
  mail: {
    template_not_found: 'Template not found',
    template_name_exists: 'Template with this name already exists',
    template_system_delete: 'Cannot delete system templates',
    template_compile_failed: 'Template compilation failed: {detail}',
  },
  media: {
    attachment_not_found_id: 'Attachment with ID {id} was not found',
    file_not_in_storage: 'File not found in storage: {key}',
  },
  storage: {
    file_not_found: 'File not found in storage: {key}',
  },
  processing_type: {
    not_found: 'Processing type with ID {id} was not found',
  },
  wallet: {
    not_found_for_user: 'Wallet not found for user {userId}',
  },
  audit: {
    log_not_found: 'Audit log with ID {id} was not found',
  },
  resource: {
    not_found_typed: '{resourceType} {resourceId} was not found',
  },
  cursor: {
    invalid_format: 'Invalid cursor format',
    invalid_date: 'Invalid cursor date',
    invalid_id: 'Invalid cursor id',
    malformed: 'Malformed cursor',
    tampered: 'Invalid or tampered cursor',
  },
};

function main(): void {
  for (const [namespace, patch] of Object.entries(PATCH)) {
    const moduleFile = path.join(EN_DIR, `${namespace}.json`);
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(moduleFile)) {
      existing = JSON.parse(fs.readFileSync(moduleFile, 'utf-8')) as Record<string, unknown>;
    }
    deepMerge(existing, patch as Record<string, unknown>);
    fs.writeFileSync(moduleFile, JSON.stringify(existing, null, 4) + '\n', 'utf-8');
    console.log(`Patched en/${namespace}.json`);
  }
  console.log('Done patching en/ module files with API error catalog additions.');
}

main();
