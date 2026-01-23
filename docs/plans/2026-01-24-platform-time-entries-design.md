# Platform Time Entries - Design

## Goal
Provide platform-only APIs to list and update tenant time entries without impersonation, gated by a new platform permission and fully audited.

## Scope
- New platform controller and service for time entries.
- Read + update only (no delete).
- Explicit tenant scoping via parameters; no tenant context.
- Platform audit logging for updates.

## Architecture
Add `PlatformTimeEntriesController` under `platform/time-entries` with platform guards and `ContextType.PLATFORM`. It calls a new `PlatformTimeEntriesService` that uses TypeORM repositories with explicit `tenantId` filters. Tenant endpoints remain unchanged and still enforce tenant admin/own-only rules.

## Permissions
Introduce `PlatformPermission.SUPPORT_TIME_ENTRIES` and require it on all new endpoints. `SUPER_ADMIN` gets it automatically via `ROLE_PERMISSIONS`. Optionally add to other platform roles later.

## Endpoints
- `GET /platform/time-entries/tenant/:tenantId`
  - Filters: `userId`, `taskId`, `status`, `from`, `to`, pagination.
- `GET /platform/time-entries/:id?tenantId=...`
  - Fetch a single entry scoped by tenant.
- `PATCH /platform/time-entries/:id`
  - Body: `tenantId`, `notes`, `billable`, `startTime`, `endTime`.
  - Reject updates to `userId`, `taskId`, `tenantId`, `status`.

## Validation and Data Handling
- All queries include `tenantId` in `where` clauses.
- If `taskId` filter is provided, validate the task exists in the tenant.
- Recompute `durationMinutes` when start/end times change and status is STOPPED.

## Audit
On updates, emit a `PlatformAuditService.log` entry with action `TIME_ENTRY_UPDATED`, target tenant/entity, and request metadata (platformUserId, ipAddress, userAgent).

## Testing
- Controller tests for permission guard wiring and request shapes.
- Service tests for filtering, update logic, and not-found cases.

