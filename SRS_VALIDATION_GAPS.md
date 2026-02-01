# SRS Validation Gaps - Chapters Studio System

## Overview
This document outlines the gaps identified during validation of the backend implementation against the SRS (Software Requirements Specification) for the Chapters Studio ERP system.

## Gap Analysis Summary

| Priority | Count | Description |
|----------|-------|-------------|
| High | 3 | Critical features missing that impact core functionality |
| Medium | 2 | Important enhancements for better user experience |
| Low | 2 | Nice-to-have features for advanced reporting |

---

## High Priority Gaps

### 1. Availability Conflict Checking for Bookings
**SRS Requirement**: Prevent bookings when staff is already assigned to conflicting tasks.

**Current State**: No automatic conflict detection implemented.

**Impact**: Risk of double-booking staff, leading to operational conflicts.

**Implementation Needed**:
- Check assigned users' task schedules before allowing booking confirmation
- Query tasks with overlapping dates for assigned users
- Block booking if conflicts found

### 2. Field Staff Wallet Self-Service Endpoint
**SRS Requirement**: Field staff should be able to view their own commission wallet.

**Current State**: `WalletsController` only allows ADMIN/OPS_MANAGER access.

**Impact**: Field staff cannot monitor their earnings, reducing transparency.

**Implementation Needed**:
- Add `/wallets/me` endpoint in `WalletsController`
- Use `@CurrentUser()` decorator to get authenticated user
- Return only the current user's wallet data
- Apply `@Roles(Role.FIELD_STAFF)` decorator

### 3. GPS Location Tracking for Field Operations
**SRS Requirement**: Location tracking for field work (رابط الخريطة) with check-in/check-out.

**Current State**: `TimeEntry` entity exists but no GPS coordinates storage.

**Impact**: Cannot track actual field work locations or verify attendance at sites.

**Implementation Needed**:
- Add `latitude`, `longitude` fields to `TimeEntry` entity
- Update check-in/check-out logic to capture GPS coordinates
- Consider mobile app integration for automatic location capture

---

## Medium Priority Gaps

### 4. Booking Deletion Constraint Enhancement
**SRS Requirement**: Prevent deletion of bookings with started tasks.

**Current State**: Only allows deletion of DRAFT bookings.

**Impact**: Potential data integrity issues if confirmed bookings are deleted.

**Implementation Needed**:
- Enhance `BookingsService.remove()` to check for tasks with status != PENDING
- Add database constraints or application-level validation
- Provide clear error messages about why deletion is blocked

### 5. Task Date Cascade Updates
**SRS Requirement**: When booking date changes, automatically update task due dates.

**Current State**: Manual updates required.

**Impact**: Risk of scheduling inconsistencies.

**Implementation Needed**:
- Add cascade update logic in `BookingsService.update()`
- Update all related tasks' `dueDate` when booking `eventDate` changes
- Send notifications to assigned users about date changes

---

## Low Priority Gaps

### 6. Profitability Reports by Service Package
**SRS Requirement**: Compare revenue vs. costs + commissions per package.

**Current State**: Basic P&L reports exist but not package-specific.

**Impact**: Limited business intelligence for package profitability analysis.

**Implementation Needed**:
- Extend `FinancialReportService` with package profitability queries
- Aggregate revenue from bookings by package
- Subtract costs and commissions for each package
- Add new report endpoints in controller

### 7. Employee Availability Calendar
**SRS Requirement**: Visual view of staff schedules based on task assignments.

**Current State**: No calendar view implemented.

**Impact**: Manual scheduling without visual aids.

**Implementation Needed**:
- Create new service for availability queries
- Aggregate task assignments by date range
- Return calendar-compatible data structure
- Add frontend calendar component (out of scope for backend)

---

## Implementation Priority Recommendations

### Phase 1 (High Priority)
1. Field Staff Wallet Endpoint - Quick win, improves user experience
2. Availability Conflict Checking - Prevents operational errors
3. GPS Location Tracking - Enhances field operation monitoring

### Phase 2 (Medium Priority)
4. Booking Deletion Constraints - Strengthens data integrity
5. Task Date Cascade - Improves scheduling accuracy

### Phase 3 (Low Priority)
6. Profitability Reports - Advanced business intelligence
7. Availability Calendar - Enhanced scheduling tools

---

## Notes
- All gaps are backend-focused; frontend implementation may be needed for some features
- Testing should be added for all new functionality
- Consider performance implications for availability checking and reporting features
- Mobile app integration may be required for GPS tracking