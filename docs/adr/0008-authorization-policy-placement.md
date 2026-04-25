# ADR-0008: Authorization Policy Placement and Guardrails

Date: 2026-02-23
Updated: 2026-04-21 (ARCH-010 completion)

## Status

Accepted

## Context

Critical write actions were protected inconsistently across layers. Some task status transitions relied on service checks only, while controller-level role requirements were implicit. This made policy drift harder to detect.

Additionally, read endpoints in the tasks controller (`GET /tasks/my-tasks`, `GET /tasks/booking/:bookingId`) lacked explicit `@Roles` decorators entirely. The `RolesGuard` returns `true` when no roles metadata is present, meaning any authenticated user could access these endpoints — inconsistent with the role-based access pattern enforced on sibling endpoints.

## Decision

- Apply explicit `@Roles(...)` decorators on **all** tasks controller endpoints, including:
  - Mutation endpoints: `start`, `complete`, `update`, `assign`, `addAssignee`, `updateAssignee`, `removeAssignee`, `delete`
  - Read endpoints accessible to field staff: `findMyTasks`, `findByBooking`, `findOne`
  - Admin/manager-only reads: `findAllWithFilters`, `findAllWithFiltersCursor`, `findAllCursor`, `export`
- Keep service-layer authorization checks as defense in depth and as protection against non-controller invocation paths.
- Add guardrail tests that validate role metadata is present and correct on both mutation and read endpoints.
- Two test files enforce this contract:
  - `src/modules/tasks/tasks-authorization-policy.spec.ts` (unit config)
  - `test/security/tasks-authorization-policy.integration.spec.ts` (integration config)

## Consequences

- Authorization intent is visible at the API boundary and still enforced in domain/service logic.
- Regression risk is reduced: metadata drift is caught by tests before release.
- The `RolesGuard`'s permissive default (`return true` when no roles set) is neutralized by the presence of explicit metadata on every endpoint.
- Future critical actions must follow the same pattern: explicit `@Roles` on the controller method + service-level validation where applicable.
