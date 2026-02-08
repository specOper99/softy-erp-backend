# Studio Owner API Integration Contract

This document is the backend handoff for Studio Owner UI integration.

## Authentication and Security

- Auth mode: JWT Bearer token (`Authorization: Bearer <token>`).
- CSRF: not used in this API contract.
- Tenant scope: all studio-side resources are tenant-scoped by authenticated context.
- Rate limit: when throttled, backend responds with `429` and `Retry-After` header.
- Standard error schema is documented as `ErrorResponseDto` with examples for `400/401/403/404/409/422/429/500`.

## Role and Access Baseline

- Studio owner role is tenant `ADMIN`.
- `ADMIN` can create studio users and manage bookings/tasks/staff/packages/settings.
- Recommended studio-managed roles for created users: `OPS_MANAGER`, `FIELD_STAFF`, `CLIENT`.

## Booking Requests and Lifecycle

Booking status semantics:

- `DRAFT`: booking request (pending owner decision)
- `CONFIRMED`: accepted request
- `COMPLETED`: delivered/completed booking
- `CANCELLED`: cancelled/rejected booking

Transitions:

- Accept request: `PATCH /api/v1/bookings/{id}/confirm` (`DRAFT -> CONFIRMED`)
- Reject request: `PATCH /api/v1/bookings/{id}/reject` (`DRAFT -> CANCELLED` only)
- Cancel booking: `PATCH /api/v1/bookings/{id}/cancel` (`DRAFT|CONFIRMED -> CANCELLED`)
- Complete booking: `PATCH /api/v1/bookings/{id}/complete` (`CONFIRMED -> COMPLETED`, tasks must be complete)

Payment actions:

- `POST /api/v1/bookings/{id}/payments`
- `POST /api/v1/bookings/{id}/submit-payment` (alias of payments)
- `PATCH /api/v1/bookings/{id}/mark-paid` (records remaining amount)

Tasks linked to booking:

- `GET /api/v1/bookings/{id}/tasks`
- `GET /api/v1/tasks/booking/{bookingId}`
- `GET /api/v1/tasks?bookingId=...`

## Atomic Staff Creation Flow

Single-step staff endpoint:

- `POST /api/v1/hr/staff`
- Creates user + profile atomically in one transaction.
- If profile creation fails, user creation is rolled back.
- Allowed roles in payload: `OPS_MANAGER`, `FIELD_STAFF`, `CLIENT`.

Legacy 2-step flow is still available if needed:

1. `POST /api/v1/users`
2. `POST /api/v1/hr/profiles`

## Endpoint Matrix (Studio Side)

### Users

- `GET /api/v1/users` (offset): filters `role`, `isActive`, `search`, pagination fields.
- `GET /api/v1/users/cursor` (cursor): filters `role`, `isActive`, `search`, `cursor`, `limit`.
- `POST /api/v1/users`, `GET /api/v1/users/{id}`, `PATCH /api/v1/users/{id}`, `DELETE /api/v1/users/{id}`.

### HR and Attendance

- Profiles: `GET /api/v1/hr/profiles`, `GET /api/v1/hr/profiles/cursor`, `POST`, `GET {id}`, `PATCH {id}`, `DELETE {id}`.
- Staff atomic create: `POST /api/v1/hr/staff`.
- Attendance: `GET /api/v1/hr/attendance`, `POST`, `GET {id}`, `PATCH {id}`, `DELETE {id}`.

### Bookings

- List/query: `GET /api/v1/bookings` with `search`, `status`, `startDate`, `endDate`, `packageId`, `clientId`, pagination.
- Cursor list: `GET /api/v1/bookings/cursor` with `cursor`, `limit`.
- CRUD + workflow: `POST`, `GET {id}`, `PATCH {id}`, `DELETE {id}`, `confirm`, `reject`, `cancel`, `complete`.
- Payments: `payments`, `submit-payment`, `mark-paid`.

### Tasks

- `GET /api/v1/tasks` and `/tasks/cursor` with `search`, `status`, `bookingId`, `assignedUserId`, `dueDateStart`, `dueDateEnd`.
- `GET /api/v1/tasks/{id}`, `PATCH /api/v1/tasks/{id}`, `PATCH /assign`, `PATCH /start`, `PATCH /complete`.
- `GET /api/v1/tasks/my-tasks`.

### Tenants (Studio)

- `GET /api/v1/tenants`: returns current tenant only.
- `GET /api/v1/tenants/{id}`, `PATCH /api/v1/tenants/{id}`: current tenant only (cross-tenant forbidden).
- `POST`/`DELETE` tenant endpoints are platform-managed and return forbidden for studio side.
- Studio settings: `GET /api/v1/tenants/studio/settings`, `PUT /api/v1/tenants/studio/settings`.

### Packages

- `GET /api/v1/packages` and `/packages/cursor` with `search`, `isActive`, pagination/cursor fields.
- CRUD and package item actions are available under `/api/v1/packages/*`.

### Dashboard

- Main endpoints: `kpis`, `studio-kpis`, `summary`, `revenue`, `booking-trends`, `staff-performance`, `package-stats`, `export`, `preferences`.
- Period/date filters are documented (`period`, `startDate`, `endDate` where applicable).

### Notifications

- `GET /api/v1/notifications` with filters `page`, `limit`, `read`, `type`.
- `GET /api/v1/notifications/unread-count`.
- `PATCH /api/v1/notifications/{id}/read`, `POST /api/v1/notifications/mark-all-read`, `DELETE /api/v1/notifications/{id}`.

## Error Contract for Frontend Handling

All studio endpoints document these error statuses where applicable:

- `400` bad request / validation
- `401` unauthorized
- `403` forbidden / role or tenant boundary
- `404` not found
- `409` conflict
- `422` business-rule violation
- `429` throttled (check `Retry-After`)

## Integration Notes

- Prefer cursor endpoints for large lists.
- Use booking `DRAFT` items as booking requests in the UI.
- Use `/bookings/{id}/reject` for explicit request rejection UX.
- Use `/hr/staff` for reliable single-step staff creation UX.
