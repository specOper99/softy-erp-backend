# Frontend Implementation Handoff Guide

## 1. System Overview
**Backend Base URL**: `/api/v1`
**Architecture**: Multi-tenant SaaS (Subdomain-based + JWT)

This system is a comprehensive ERP for service-based businesses (e.g., HVAC, Cleaning, Repair). It consists of **four** distinct interfaces that the frontend must support:
1.  **Admin/Ops Dashboard**: For business owners and managers to schedule jobs, manage staff, and view financials.
2.  **Field Staff App**: For technicians to view their assigned tasks, clock in/out, and complete jobs.
3.  **Client Portal**: For end-customers to view their bookings and invoices (Magic Link access).
4.  **Platform Admin Console** *(Superadmin)*: For SaaS operators to manage tenants, billing, security, and compliance.

> 📖 **For detailed Platform Admin API documentation, see:** [`src/modules/platform/README.md`](src/modules/platform/README.md)

---

## 2. Authentication & Multi-Tenancy (CRITICAL)

The system uses a strict **Multi-Tenant Architecture**.

### 2.1. Tenant Resolution Logic
The backend resolves the "Current Tenant" in this order:
1.  **JWT Token**: If an `Authorization: Bearer <token>` header is present, the Tenant ID is extracted from the token.
2.  **Subdomain**: If no token is present (e.g., during Login), the backend **requires** the request to come from a valid subdomain (e.g., `acme-cleaning.softy-erp.com`).

### 2.2. Authentication Methods

| User Type | Method | Endpoint | Headers Required |
| :--- | :--- | :--- | :--- |
| **Admin / Ops / Staff** | Email & Password (JWT) | `POST /auth/login` | `Content-Type: application/json` |
| **Client (End User)** | Magic Link | `POST /client-portal/auth/...` | `x-client-token: <token>` (after verify) |

### 2.3. The Login Flow (Admin/Staff)
1.  **Registration**: Public endpoint.
    *   `POST /auth/register` (Body: `companyName`, `email`, `password`)
    *   **Response**: Returns an `accessToken` (JWT). YOU MUST redirect the user to their new subdomain (e.g., `slug.app.com`) or they must log in from there next time.
2.  **Login**:
    *   **Constraint**: Must happen on the tenant's subdomain OR the user must already have a valid JWT.
    *   **Payload**: `{ "email": "...", "password": "..." }`
    *   **Response**: `{ "accessToken": "...", "refreshToken": "...", "user": { ... } }` OR `{ "requiresMfa": true, "tempToken": "..." }`
3.  **MFA**:
    *   If `requiresMfa` is true, use `POST /auth/mfa/verify-totp` with the `tempToken` and the OTP code to get the final JWT.

### 2.4. The Client Portal Flow
1.  **Request Link**: `POST /client-portal/auth/request-magic-link` (Body: `{ "email": "..." }`)
2.  **Verify Link**: User clicks email link -> Frontend calls `POST /client-portal/auth/verify` (Body: `{ "token": "..." }`)
3.  **Session**: Response contains `accessToken`. **Store this separately** from the main Staff JWT. Send it in the `x-client-token` header for all `/client-portal` requests.

---

## 3. Core Modules & Implementation Details

### 3.1. Service Catalog (Prerequisite for Bookings)
Before creating bookings, Admins must define what they sell.
*   **Endpoints**: `/packages`
*   **Key Actions**:
    *   Create Package: `POST /packages` (Name, Price, Duration).
    *   Add Items: `POST /packages/:id/items` (Line items included in the service).
*   **Frontend Tip**: Provide a "Service Builder" UI where Admins can bundle basic tasks into a sellable package.

### 3.2. Bookings (The Core Workflow)
Bookings represent a job scheduled for a client.
*   **Endpoints**: `/bookings`
*   **Data Structure (`CreateBookingDto`)**:
    *   `clientId`: UUID (Select from existing Clients).
    *   `packageId`: UUID (Select from Catalog).
    *   `eventDate`: ISO Date String.
*   **State Machine**:
    1.  **DRAFT**: Created via `POST /bookings`. Editable.
    2.  **CONFIRMED**: Triggered via `PATCH /bookings/:id/confirm`.
        *   *Backend Action*: Automatically generates **Tasks** for staff based on the Package definition.
        *   *Backend Action*: Creates a Financial Transaction (Invoice).
    3.  **COMPLETED**: Triggered via `PATCH /bookings/:id/complete`.
        *   *Constraint*: All linked Tasks must be status `COMPLETED`.
    4.  **CANCELLED**: Triggered via `PATCH /bookings/:id/cancel`. Calculates refunds automatically.
    5.  **DUPLICATE**: Triggered via `POST /bookings/:id/duplicate`. Creates a copy of the booking as a DRAFT.

### 3.3. specific Tasks (Field Staff Execution)
Tasks are the units of work generated from a Booking.
*   **Endpoints**: `/tasks`
*   **Staff View**:
    *   Use `GET /tasks/my-tasks` to show only assigned work.
*   **Task Lifecycle**:
    *   **Assign**: `PATCH /tasks/:id/assign` (Admin assigns to user).
    *   **Start**: `PATCH /tasks/:id/start` (Staff clocks in - status `IN_PROGRESS`).
    *   **Complete**: `PATCH /tasks/:id/complete` (Staff finishes - status `COMPLETED`).
        *   *Effect*: Accrues commission to the staff's wallet.

### 3.4. Dashboard (Analytics)
Visualize the health of the business.
*   **Endpoints**: `/dashboard`
*   **Required Visualizations**:
    1.  **KPIS**: `GET /dashboard/kpis` (Cards: Revenue, Total Bookings, completion %).
    2.  **Revenue Chart**: `GET /dashboard/summary` (Bar chart: Income vs Payouts).
    3.  **Booking Trends**: `GET /dashboard/booking-trends` (Line chart).
    4.  **Staff Leaderboard**: `GET /dashboard/staff-performance` (Table).
*   **Export**: `GET /dashboard/export?format=csv|pdf` (Provide a download button).

---

## 4. Technical Best Practices

### 4.1. Pagination
*   **Cursor Pagination** is preferred over Offset for large lists (Bookings, Users, Tasks).
*   **Endpoint**: `/module/cursor` (e.g., `/bookings/cursor`).
*   **Parameters**: `take` (limit), `cursor` (encoded string from previous response).
*   **Response**: `{ "data": [...], "meta": { "nextCursor": "..." } }`

### 4.2. Error Handling
The backend uses standard HTTP codes. Frontend must handle these gracefully:
*   `400 Bad Request`: Validation failure. Display the specific error message from the response body.
*   `401 Unauthorized`: Token expired or missing. Redirect to Login.
*   `403 Forbidden`: User lacks permission (e.g., Field Staff trying to delete a booking). Show "Access Denied" toast.
*   `429 Too Many Requests`: Rate limit hit. Show "Please wait X seconds".

### 4.3. Dates & Times
*   All dates are stored and exchanged as **UTC ISO Strings** (e.g., `2023-10-27T14:30:00Z`).
*   **Frontend Responsibility**: Convert to the user's Local Timezone for display.

### 4.4. Security Headers
*   **CORS**: Configured for `localhost:3000`, `4200`, `5173`.
*   **CSRF**: Cookies are used. Ensure `withCredentials: true` is set in your HTTP client (Axios/Fetch).

---

## 5. Platform Admin Console (Superadmin)

> ⚠️ **This section is for the internal SaaS operations team, NOT tenant-level admin users.**

### 5.1. Overview

The Platform Admin Console is a separate application context for managing the entire SaaS platform. It uses a **different authentication context** (`platform` audience) than regular tenant users.

**Full API Documentation**: [`src/modules/platform/README.md`](src/modules/platform/README.md)

### 5.2. Authentication (Platform Context)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| Login | `POST /platform/auth/login` | Email/Password + **MFA Required** |
| MFA Verify | `POST /platform/auth/mfa/verify` | TOTP code verification |
| Logout | `POST /platform/auth/logout` | End platform session |

**Key Differences from Tenant Auth:**
- MFA is **mandatory** for all platform users
- JWT token has `audience: "platform"` (not `"tenant"`)
- Sessions expire after 4 hours of inactivity
- All actions are audit logged

### 5.3. Platform Roles & Permissions

| Role | Description | Key Permissions |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Full platform access | All permissions |
| `SUPPORT_ADMIN` | Customer support | Impersonation, View Logs, Suspend Tenants |
| `BILLING_ADMIN` | Revenue operations | Manage Subscriptions, Issue Refunds |
| `COMPLIANCE_ADMIN` | Data compliance | GDPR Export/Delete, Audit Logs |
| `SECURITY_ADMIN` | Security operations | Lock Tenants, Force Password Resets |
| `ANALYTICS_VIEWER` | Read-only dashboards | View Metrics (no write access) |

### 5.4. Core Features

#### Tenant Management
```
GET    /platform/tenants              - List all tenants (with filters)
GET    /platform/tenants/:id          - Get tenant details + metrics
POST   /platform/tenants              - Onboard new tenant
PATCH  /platform/tenants/:id          - Update tenant settings
DELETE /platform/tenants/:id          - Schedule deletion (with grace period)
POST   /platform/tenants/:id/suspend  - Suspend for billing/violations
POST   /platform/tenants/:id/lock     - Emergency security lock
```

#### Support Impersonation
```
POST   /platform/support/impersonate           - Start session (requires reason)
DELETE /platform/support/impersonate/:id       - End session
GET    /platform/support/impersonate/active    - List active sessions
GET    /platform/support/impersonate/history   - Full audit trail
```
**⚠️ All impersonation actions are logged and time-limited (max 4 hours).**

#### Security Operations
```
POST   /platform/security/force-password-reset - Force user password reset
POST   /platform/security/revoke-sessions      - Revoke all tenant sessions
PATCH  /platform/security/ip-allowlist/:id     - Update tenant IP allowlist
POST   /platform/security/data-export          - Initiate GDPR export
POST   /platform/security/data-deletion        - Schedule data deletion
```

#### Audit Logs
```
GET    /platform/audit/logs           - Query with filters (action, date, user)
GET    /platform/audit/logs/export    - Export audit trail (CSV/JSON)
```

### 5.5. Frontend Implementation Notes

1. **Separate App Context**: The Platform Admin should be a **separate React/Vue/Angular app** or route tree (e.g., `admin.yoursaas.com` or `/platform/*`).

2. **Permission-Based UI**: Use the role's permissions to conditionally render features:
   ```typescript
   // Example: Only show "Delete Tenant" for SUPER_ADMIN
   if (user.permissions.includes('platform:tenants:delete')) {
     showDeleteButton();
   }
   ```

3. **Reason Dialogs**: Many sensitive operations require a `reason` field. Build modal dialogs that:
   - Require minimum 10 characters
   - Explain why the reason is needed (compliance)
   - Show warning before destructive actions

4. **Real-time Audit Feed**: Consider a WebSocket connection to `/platform/audit/stream` for live audit log updates.

### 5.6. Functional Roadmap (Not Yet Implemented)

| Feature | Status | Notes |
| :--- | :--- | :--- |
| Stripe Billing Integration | 🔜 Planned | Auto-suspend on payment failure |
| Automated GDPR Tools | 🔜 Planned | Scheduled export/deletion jobs |
| Device Fingerprinting | 🔜 Planned | Enhanced session security |
| Advanced IP Allowlisting | 🔜 Planned | CIDR ranges, geo-blocking |
| Platform Analytics Dashboard | 🔜 Planned | Revenue metrics, churn analysis |

---

## 6. Development Checklist

### Tenant App (Primary)
- [ ] Setup Axios interceptor to attach `Authorization: Bearer` token.
- [ ] Implement "Context Switcher" or ensure login hits the correct Subdomain.
- [ ] Build `AuthGuard` for routes.
- [ ] Create shared Types based on the DTOs (Code generation from Swagger recommended: `/api/docs-json`).
- [ ] Implement "Service Catalog" wizard.
- [ ] Build "Job Board" view for Bookings (Calendar or Kanban).
- [ ] Build Mobile-responsive "My Tasks" view for Staff.

### Platform Admin Console (Superadmin)
- [ ] Create separate app/route tree for Platform Admin
- [ ] Implement Platform Auth flow with mandatory MFA
- [ ] Build Tenant Management dashboard (list, search, filters)
- [ ] Build Tenant Detail view (metrics, timeline, actions)
- [ ] Implement Impersonation UI with session management
- [ ] Build Audit Log viewer with search/filter/export
- [ ] Implement permission-based feature visibility
- [ ] Add confirmation dialogs for destructive operations

