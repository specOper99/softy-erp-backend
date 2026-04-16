# SRS Validation Gaps - Chapters Studio System

## Overview
This document tracks active backend gaps against the SRS for Chapters Studio ERP. Finance-specific notes were revalidated on 2026-04-13 so resolved items do not remain listed as open gaps.

## Gap Analysis Summary

| Priority | Count | Description |
|----------|-------|-------------|
| High | 2 | Critical features missing that impact core functionality |
| Medium | 2 | Important enhancements for better user experience |
| Low | 1 | Nice-to-have feature for advanced scheduling |

---

## Finance Status Verified On 2026-04-13

The following finance items were previously flagged in older audits and are no longer active SRS gaps:

- Field staff wallet self-service is implemented at `GET /wallets/me` in `WalletsController`, with RBAC coverage for `FIELD_STAFF`, `ADMIN`, and `OPS_MANAGER`.
- Package profitability reporting is implemented at `GET /finance/reports/profitability/packages`.
- Booking-to-finance transactional invariants are tracked in [backend/docs/TENANT_FINANCE_REQUIREMENTS_MATRIX.md](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/docs/TENANT_FINANCE_REQUIREMENTS_MATRIX.md).
- Cached OpenAPI artifacts were refreshed on 2026-04-13 to include booking invoice lookup, so there is no active finance SRS gap from the latest tenant audit.

---

## High Priority Gaps

### 1. Availability Conflict Checking for Bookings
**SRS Requirement**: Prevent bookings when staff is already assigned to conflicting tasks.

**Current State**: No automatic conflict detection implemented during booking confirmation.

**Impact**: Risk of double-booking staff, leading to operational conflicts.

**Implementation Needed**:
- Check assigned users' task schedules before allowing booking confirmation.
- Query tasks with overlapping dates for assigned users.
- Block booking if conflicts are found.

### 2. GPS Location Tracking for Field Operations
**SRS Requirement**: Location tracking for field work (رابط الخريطة) with check-in/check-out.

**Current State**: `TimeEntry` exists but GPS coordinates are not stored.

**Impact**: Cannot track actual field work locations or verify attendance at sites.

**Implementation Needed**:
- Add `latitude` and `longitude` fields to `TimeEntry`.
- Update check-in/check-out logic to capture coordinates.
- Consider mobile capture flow for reliable location collection.

---

## Medium Priority Gaps

### 3. Booking Deletion Constraint Enhancement
**SRS Requirement**: Prevent deletion of bookings with started tasks.

**Current State**: Only `DRAFT` bookings are deletable.

**Impact**: Potential data integrity issues if non-draft lifecycle rules are relaxed without task-state validation.

**Implementation Needed**:
- Keep deletion blocked when any related task has progressed beyond `PENDING`.
- Add application-level validation or a stronger invariant at the persistence boundary.
- Return a clear error describing the blocking task state.

### 4. Task Date Cascade Updates
**SRS Requirement**: When booking date changes, automatically update task due dates.

**Current State**: Task due dates are not automatically cascaded from booking date edits.

**Impact**: Scheduling inconsistencies can remain after reschedules.

**Implementation Needed**:
- Cascade `eventDate` changes to related task due dates.
- Notify assigned users when the effective schedule changes.

---

## Low Priority Gaps

### 5. Employee Availability Calendar
**SRS Requirement**: Visual view of staff schedules based on task assignments.

**Current State**: No calendar-ready backend aggregation dedicated to availability views.

**Impact**: Scheduling remains list-based and less operationally efficient.

**Implementation Needed**:
- Aggregate assignments into calendar-friendly availability windows.
- Provide a range-based API for frontend calendar rendering.

---

## Implementation Priority Recommendations

### Phase 1
1. Availability conflict checking for bookings.
2. GPS location tracking for field operations.

### Phase 2
1. Booking deletion constraint enhancement.
2. Task date cascade updates.

### Phase 3
1. Employee availability calendar.

---

## Notes
- This file tracks active SRS gaps only.
- Contract drift and cached OpenAPI issues are tracked separately from feature-level SRS validation.
- Finance workflow proofs and residual audit gaps live in [backend/docs/TENANT_FINANCE_REQUIREMENTS_MATRIX.md](/Users/mohammadnawfal/Desktop/Archive/softy-erp/backend/docs/TENANT_FINANCE_REQUIREMENTS_MATRIX.md).
- Environment helpers added during the finance audit: `E2E_USE_EXISTING_DB=true`, `INTEGRATION_USE_EXISTING_DB=true`, and `npm run openapi:export` for queue-free, DB-independent OpenAPI export.
