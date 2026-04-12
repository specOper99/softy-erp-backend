# Business Logic Stabilization Plan

Date: 2026-02-23
Project: `backend`

## Objective

Stabilize cross-module business logic consistency by eliminating lifecycle drift, tenant-policy leaks, and shared-rule divergence.

## Key Findings Snapshot

- Booking lifecycle is fragmented across multiple mutation paths with different side effects.
- Client portal bypasses parts of the booking workflow and tenant-status gating.
- Query-builder safety contract and module query patterns are not fully aligned.
- Date/time and slot-capacity semantics are inconsistent across booking/availability paths.
- Some shared business rules are duplicated across DTO and service layers.

## Prioritized Backlog

### P0 (Immediate Stabilization)

#### ARCH-001 - Single-path booking lifecycle transitions

- Priority: P0
- Story Points: 8
- Owner: BE-Architect
- Dependencies: None
- Scope:
  - `src/modules/bookings/services/bookings.service.ts`
  - `src/modules/bookings/dto/booking.dto.ts`
  - `src/modules/bookings/controllers/bookings.controller.ts`
- Acceptance Criteria:
  - Generic `PATCH /bookings/:id` cannot perform lifecycle status transitions.
  - Lifecycle transitions only occur via dedicated workflow endpoints (`confirm`, `cancel`, `complete`, `reschedule`).
  - Regression tests confirm side effects are not bypassed.

#### ARCH-002 - Route client-portal cancellation through workflow

- Priority: P0
- Story Points: 8
- Owner: BE-Architect
- Dependencies: ARCH-001
- Scope:
  - `src/modules/client-portal/services/client-portal.service.ts`
  - `src/modules/bookings/services/booking-workflow.service.ts`
  - `src/modules/client-portal/client-portal.controller.ts`
- Acceptance Criteria:
  - Client cancel path triggers same side effects as admin/workflow cancel.
  - `BookingCancelledEvent` is emitted consistently.
  - Cancellation is idempotent and covered by integration tests.

#### ARCH-003 - Enforce tenant status on all client-portal paths

- Priority: P0
- Story Points: 8
- Owner: BE-Platform
- Dependencies: None
- Scope:
  - `src/modules/client-portal/guards/client-token.guard.ts`
  - `src/modules/client-portal/client-portal.controller.ts`
  - `src/modules/tenants/tenants.service.ts`
  - `src/modules/client-portal/decorators/validate-tenant-slug.decorator.ts`
  - `src/modules/client-portal/client-portal.module.ts`
- Acceptance Criteria:
  - Suspended/locked tenants are blocked on listing and authenticated client-portal routes.
  - Error contract is consistent for blocked tenant states.
  - E2E coverage includes ACTIVE vs SUSPENDED/LOCKED tenant behavior.

#### ARCH-004 - Add missing availability cache invalidation in workflow transitions

- Priority: P0
- Story Points: 5
- Owner: BE-Platform
- Dependencies: ARCH-001
- Scope:
  - `src/modules/bookings/services/booking-workflow.service.ts`
  - Related availability cache wiring/injection points
- Acceptance Criteria:
  - Confirm/cancel/reschedule/complete invalidate availability cache consistently.
  - Slot availability reflects updates immediately.
  - Integration tests cover stale-cache prevention.

### P1 (Consistency and Contract Alignment)

#### ARCH-005 - Reconcile query-builder tenant-safety contract

- Priority: P1
- Story Points: 8
- Owner: BE-Platform
- Dependencies: None
- Scope:
  - `src/common/repositories/tenant-aware.repository.ts`
  - `src/modules/tasks/services/tasks.service.ts`
  - `src/modules/catalog/services/catalog.service.ts`
  - `src/modules/hr/services/hr.service.ts`
- Acceptance Criteria:
  - OR-based filters remain supported safely, or are replaced with tenant-safe alternatives.
  - No runtime conflict between repository contract and module queries.
  - Negative tests prove no cross-tenant leakage.

#### ARCH-006 - Normalize `eventDate` and slot-capacity semantics

- Priority: P1
- Story Points: 8
- Owner: BE-Architect
- Dependencies: ARCH-001
- Scope:
  - `src/modules/client-portal/services/client-portal.service.ts`
  - `src/modules/client-portal/services/availability.service.ts`
  - `src/modules/bookings/dto/booking.dto.ts`
  - `src/modules/bookings/services/bookings.service.ts`
- Acceptance Criteria:
  - Canonical date/time rule defined and enforced across create/check flows.
  - Capacity checks align with availability query semantics.
  - Timezone edge-case tests pass.

#### ARCH-007 - Remove finance invariant duplication

- Priority: P1
- Story Points: 5
- Owner: BE-Architect
- Dependencies: None
- Scope:
  - `src/modules/finance/dto/finance.dto.ts`
  - `src/modules/finance/services/finance.service.ts`
- Acceptance Criteria:
  - One canonical implementation for negative amount refund/reversal rule.
  - DTO layer remains boundary validation, domain rule owned in service/shared domain validator.
  - API and internal service behavior stays consistent.

#### ARCH-008 - Close package update event contract gaps

- Priority: P1
- Story Points: 5
- Owner: BE-Platform
- Dependencies: None
- Scope:
  - `src/modules/catalog/services/catalog.service.ts`
  - `src/modules/catalog/events/package.events.ts`
  - Add or remove downstream handlers as appropriate
- Acceptance Criteria:
  - Event is either handled end-to-end or intentionally removed.
  - No dangling published-but-unhandled event contract remains.
  - Integration tests verify chosen behavior.

### P2 (Hardening and Governance)

#### ARCH-009 - Enforce soft-delete aware media reference integrity

- Priority: P2
- Story Points: 3
- Owner: BE-Platform
- Dependencies: None
- Scope:
  - `src/modules/media/media.service.ts`
- Acceptance Criteria:
  - Attachments cannot reference soft-deleted bookings/tasks.
  - Validation errors are explicit and tested.

#### ARCH-010 - Standardize authorization policy placement + architecture guardrails

- Priority: P2
- Story Points: 5
- Owner: BE-Architect
- Dependencies: ARCH-001, ARCH-003
- Scope:
  - `src/modules/tasks/controllers/tasks.controller.ts`
  - `src/modules/tasks/services/tasks.service.ts`
  - `docs/` ADR and policy docs
  - Test guardrails in `test/`
- Acceptance Criteria:
  - Authorization policy placement is consistent and documented.
  - Controller + service defense-in-depth is enforced for critical actions.
  - Architecture constraints are captured in ADR and regression tests.

## Sprint Board

Capacity assumption: 2 backend engineers + 1 QA engineer, 2-week sprint.

### Sprint 1 (P0)

- ARCH-001 (8 SP) - BE-Architect
- ARCH-002 (8 SP) - BE-Architect (depends on ARCH-001)
- ARCH-003 (8 SP) - BE-Platform
- ARCH-004 (5 SP) - BE-Platform (depends on ARCH-001)
- QA-001 End-to-end lifecycle + tenant gating regression suite (8 SP) - QA-Lead (depends on ARCH-001..004)
- Total: 37 SP

### Sprint 2 (P1/P2)

- ARCH-005 (8 SP) - BE-Platform
- ARCH-006 (8 SP) - BE-Architect (depends on ARCH-001)
- ARCH-007 (5 SP) - BE-Architect
- ARCH-008 (5 SP) - BE-Platform
- ARCH-009 (3 SP) - BE-Platform
- ARCH-010 (5 SP) - BE-Architect (depends on ARCH-001, ARCH-003)
- QA-002 Cross-tenant negative + event contract regression pack (8 SP) - QA-Lead (depends on ARCH-005..010)
- Total: 42 SP

## Test Matrix

### QA-001 (Sprint 1)

- Booking lifecycle contract tests:
  - Generic update cannot perform lifecycle transitions.
  - Workflow endpoints trigger expected side effects.
- Tenant gating tests:
  - ACTIVE tenant allowed.
  - SUSPENDED/LOCKED tenant blocked on both listing and authenticated portal paths.
- Event + side-effect parity tests:
  - Client cancellation and admin cancellation produce equivalent downstream effects.

### QA-002 (Sprint 2)

- Query safety tests:
  - OR filters remain tenant-scoped.
  - No cross-tenant records returned for adversarial queries.
- Date/time consistency tests:
  - Availability and booking creation use the same slot-capacity semantics.
  - Timezone boundary behavior validated.
- Shared-rule tests:
  - Finance negative amount rule behaves identically across API and internal calls.
- Event contract tests:
  - `PackageUpdatedEvent` contract is explicit (handled or removed) and verifiable.

## Definition of Done (All Tickets)

- No TypeScript/lint errors.
- Relevant unit/integration/e2e tests added and passing.
- Tenant-isolation negative test included for affected areas.
- Observability/logging reviewed for modified critical flows.
- Behavior-impacting changes documented (ADR/changelog as applicable).

## Risks and Controls

- Risk: breaking existing endpoint contracts during lifecycle consolidation.
  - Control: preserve API route signatures where possible, add deprecation path for unsafe status updates.
- Risk: regressions in portal UX due to stricter tenant gating.
  - Control: align error contracts and client messaging before rollout.
- Risk: query-builder refactor impacts performance.
  - Control: baseline key queries and run before/after performance checks.

## Rollout Notes

- Deploy P0 behind feature flags where feasible (`strictBookingLifecycle`, `strictPortalTenantStatus`).
- Enable read-only telemetry first, then enforce blocking behavior.
- Monitor booking cancellations, cache-hit patterns, and tenant access-denial rates after release.
