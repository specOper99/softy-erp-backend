/**
 * Replace exact English strings inside *.ts (non-spec) throw/new *Exception('...')
 * First matching substring wins; longest keys should be sorted first.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '../../src');

/** Longest / most specific patterns first */
const STRING_TO_KEY: [string, string][] = [
  ['Too many requests. Blocked for ', '__TEMPLATE_RATE_BLOCK__'], // handled separately
  ['MFA is required for this action. Please enable MFA in your account settings.', 'auth.mfa_required_enable'],
  ['Account temporarily locked. Try again in ', '__SKIP_TEMPLATE__'],
  ['User not found or inactive', 'auth.user_not_found_or_inactive'],
  ['Refresh token expired or revoked', 'auth.refresh_token_expired_or_revoked'],
  ['Verification token has expired', 'auth.verification_token_expired'],
  ['Invalid verification token', 'auth.invalid_verification_token'],
  ['Invalid refresh token', 'auth.invalid_refresh_token'],
  ['Invalid MFA code', 'auth.invalid_mfa_code'],
  ['Invalid or expired token', 'auth.invalid_or_expired_token'],
  ['Invalid recovery code', 'auth.invalid_recovery_code'],
  ['Invalid credentials', 'auth.invalid_credentials'],
  ['Invalid token tenant', 'auth.invalid_token_tenant'],
  ['Invalid platform token', 'auth.invalid_platform_token'],
  ['Invalid session', 'auth.invalid_session'],
  ['Invalid token', 'auth.token_invalid'],
  ['Token has expired', 'auth.token_expired'],
  ['User not found in tenant', 'hr.user_not_found_in_tenant'],
  ['User not found', 'common.user_not_found'],
  ['Authentication required', 'common.authentication_required'],
  ['Invalid resource identifier', 'common.invalid_resource_id'],
  ['Field staff can only access their own records', 'common.field_staff_own_records'],
  ['Invalid or tampered cursor', 'cursor.tampered'],
  ['Invalid cursor format', 'cursor.invalid_format'],
  ['Invalid cursor date', 'cursor.invalid_date'],
  ['Invalid cursor id', 'cursor.invalid_id'],
  ['Malformed cursor', 'cursor.malformed'],
  ['refreshToken is required unless allSessions=true', 'auth.refresh_token_body_required'],
  ['Tenant with this name or slug already exists', 'tenants.tenant_exists_name_slug'],
  ['Account is deactivated', 'auth.account_deactivated'],
  ['MFA session expired or invalid. Please login again.', 'auth.mfa_session_expired'],
  ['Invalid or expired reset token', 'auth.invalid_reset_token'],
  ['Session not found or already revoked', 'auth.session_not_found_or_revoked'],
  ['Tenant already has an active subscription', 'tenants.subscription_active_exists'],
  ['No subscription found for tenant', 'billing.subscription_none_for_tenant'],
  ['Only DRAFT bookings can be rejected', 'booking.reject_draft_only'],
  ['Package is in use and cannot be deleted', 'catalog.package_in_use'],
  ['Listing not found', 'booking.listing_not_found'],
  ['Invalid date format. Use YYYY-MM-DD', 'client_portal.invalid_date_format_hint'],
  ['Can only review completed bookings', 'client_portal.review_completed_only'],
  ['You have already reviewed this booking', 'client_portal.review_already_submitted'],
  ['tenantSlug is required', 'client_portal.tenant_slug_required_param'],
  ['Date format must be YYYY-MM-DD', 'client_portal.date_format_yyyy_mm_dd'],
  ['Invalid availability date range', 'client_portal.availability_range_invalid'],
  ['Tenant slug is required', 'client_portal.tenant_slug_required_body'],
  ['Client not found', 'client_portal.client_not_found'],
  ['Booking cannot be cancelled in its current status', 'client_portal.booking_cancel_status'],
  ['Selected time slot is fully booked', 'client_portal.slot_fully_booked'],
  ['Recurring transaction not found', 'finance.recurring_not_found'],
  ['Field staff can only create attendance records for themselves', 'hr.attendance_self_only_create'],
  ['Invalid userId', 'hr.attendance_invalid_user_id'],
  ['Field staff can only view their own attendance records', 'hr.attendance_self_only_view'],
  ['Attendance record for this user and date already exists', 'hr.attendance_duplicate_day'],
  ['Unsupported staff role for studio tenant', 'hr.unsupported_studio_role'],
  ['User or profile already exists', 'hr.user_or_profile_exists'],
  ['Template not found', 'mail.template_not_found'],
  ['Template with this name already exists', 'mail.template_name_exists'],
  ['Cannot delete system templates', 'mail.template_system_delete'],
  ['Platform role required', 'platform.role_required'],
  ['A detailed reason (minimum 10 characters) is required for this operation', 'platform.reason_required'],
  ['Impersonation session not found', 'platform.impersonation_not_found'],
  ['Session is already ended', 'platform.impersonation_session_ended'],
  ['You can only end your own impersonation sessions', 'platform.impersonation_end_own_only'],
  ['Incorrect password. MFA cannot be disabled.', 'auth.incorrect_password_mfa_disable'],
  ['Account suspended', 'auth.account_suspended'],
  ['IP not allowed', 'auth.ip_not_allowed'],
  ['MFA not enabled', 'auth.mfa_not_enabled'],
  ['Session expired or revoked', 'auth.session_expired_or_revoked'],
  ['User inactive', 'auth.user_inactive'],
  ['Tenant is already suspended', 'tenants.suspended_already'],
  ['Tenant is already active', 'tenants.active_already'],
  ['End time cannot be earlier than start time', 'platform.end_time_before_start'],
  ['Invalid token audience', 'auth.invalid_token_audience'],
  ['Session revoked', 'auth.session_revoked'],
  ['Session expired', 'auth.session_expired'],
  ['MFA required', 'auth.mfa_required'],
  ['Only pending requests can be cancelled', 'privacy.cancel_pending_only'],
  ['Invalid user ID format', 'privacy.invalid_user_id_format'],
  ['Invalid file path', 'privacy.invalid_file_path'],
  ['Invalid request type', 'privacy.invalid_request_type'],
  ['Privacy request not found', 'privacy.request_not_found'],
  ['A task cannot be its own parent', 'tasks.cannot_be_own_parent'],
  ['Task reassignment must use the assign endpoint', 'tasks.reassignment_use_assign'],
  ['Status updates must use dedicated endpoints (start/complete)', 'tasks.status_use_endpoints'],
  ['commissionSnapshot must be greater than 0', 'tasks.commission_snapshot_positive'],
  ['Not allowed to read this task assignees list', 'tasks.assignees_forbidden'],
  ['Task is already completed', 'tasks.already_completed'],
  ['Cannot complete task: no user assigned', 'tasks.complete_no_assignee'],
  ['User context is required', 'common.user_context_required'],
  ['Task is not assigned', 'tasks.not_assigned'],
  ['Not allowed', 'common.not_allowed'],
  ['Not allowed to modify this task', 'tasks.modify_forbidden'],
  ['You have an active timer. Please stop it first.', 'time_entries.active_timer'],
  ['Timer is not running', 'time_entries.timer_not_running'],
  ['Not allowed to update this time entry', 'time_entries.update_forbidden'],
  ['Time entry not found', 'time_entries.not_found'],
  ['Task not found', 'task.not_found_plain'],
  ['Tenant creation is not supported via API', 'tenants.creation_not_supported'],
  ['Tenant deletion is not supported via API', 'tenants.deletion_not_supported'],
  ['Cross-tenant access is forbidden', 'tenants.cross_tenant_forbidden'],
  ['Unauthorized', 'common.unauthorized_plain'],
  ['Too many requests', 'common.too_many_requests'],
  ['Booking not found', 'bookings.not_found'],
  ['Package not found', 'client_portal.package_not_found'],
  ['Tenant not found', 'tenants.not_found'],
  ['An active impersonation session already exists for this user', 'platform.impersonation_session_exists'],
];

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir)) {
    const f = path.join(dir, e);
    if (fs.statSync(f).isDirectory()) {
      if (!['node_modules', 'dist'].includes(e)) walk(f, out);
      continue;
    }
    if (e.endsWith('.ts') && !e.endsWith('.spec.ts') && !e.endsWith('.d.ts')) out.push(f);
  }
}

function transformLine(line: string): string {
  let s = line;
  if (s.includes('`Too many requests. Blocked for ') && s.includes('HttpStatus.TOO_MANY_REQUESTS')) {
    s = s.replace(
      /new HttpException\(`Too many requests\. Blocked for \$\{remainingSecs\} seconds\.`, HttpStatus\.TOO_MANY_REQUESTS\)/,
      "new HttpException({ code: 'common.too_many_requests_blocked', args: { seconds: remainingSecs } }, HttpStatus.TOO_MANY_REQUESTS)",
    );
  }
  if (s.includes("new HttpException('Too many requests'")) {
    s = s.replace(
      /new HttpException\('Too many requests', HttpStatus\.TOO_MANY_REQUESTS\)/,
      "new HttpException('common.too_many_requests', HttpStatus.TOO_MANY_REQUESTS)",
    );
  }
  for (const [eng, key] of STRING_TO_KEY) {
    if (key.startsWith('__')) continue;
    const q = `'${eng.replace(/'/g, "\\'")}'`;
    const replacement = `'${key}'`;
    if (s.includes(q)) {
      s = s.split(q).join(replacement);
    }
  }
  return s;
}

function main(): void {
  const files: string[] = [];
  walk(ROOT, files);
  let changed = 0;
  for (const file of files) {
    const orig = fs.readFileSync(file, 'utf-8');
    const lines = orig.split('\n');
    const next = lines.map(transformLine).join('\n');
    if (next !== orig) {
      fs.writeFileSync(file, next, 'utf-8');
      changed++;
    }
  }
  console.log(`Updated ${changed} files.`);
}

main();
