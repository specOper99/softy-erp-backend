# Platform Module - Superadmin Console

## Overview

The Platform Module provides a complete superadmin console for managing the SaaS platform, including tenant management, billing operations, support tools, security controls, and compliance features.

## Architecture

### Dual-Context Authentication

The platform uses a dual-context authentication system to separate tenant operations from platform operations:

- **Tenant Context**: Regular application users with JWT audience `tenant`
- **Platform Context**: Platform administrators with JWT audience `platform`

This ensures complete separation between tenant data and platform administration.

### Role-Based Access Control (RBAC)

Platform roles with specific permissions:

1. **SUPER_ADMIN**: Full platform access
2. **SUPPORT_ADMIN**: Customer support operations
3. **BILLING_ADMIN**: Billing and subscription management
4. **COMPLIANCE_ADMIN**: Data export, deletion, compliance
5. **SECURITY_ADMIN**: Security policy management
6. **ANALYTICS_VIEWER**: Read-only platform metrics

## Key Features

### 1. Tenant Management

Complete lifecycle management for tenants:

- **Create/Read/Update/Delete** tenants
- **Suspend/Reactivate** tenant accounts
- **Lock** tenants for security incidents
- **Schedule deletion** with grace periods
- View tenant metrics and timeline
- Track tenant health and risk scores

**API Endpoints:**
```
GET    /platform/tenants              - List all tenants with filtering
GET    /platform/tenants/:id          - Get tenant details
POST   /platform/tenants              - Create new tenant
PATCH  /platform/tenants/:id          - Update tenant
DELETE /platform/tenants/:id          - Schedule tenant deletion
POST   /platform/tenants/:id/suspend  - Suspend tenant
POST   /platform/tenants/:id/reactivate - Reactivate tenant
POST   /platform/tenants/:id/lock     - Lock tenant (security)
GET    /platform/tenants/:id/metrics  - Get tenant metrics
GET    /platform/tenants/:id/timeline - Get lifecycle events
```

### 2. Impersonation System

Secure tenant user impersonation for support:

- **Start impersonation** with reason tracking
- **Automatic logging** of all actions
- **Time-limited sessions** (4 hours max)
- **Audit trail** for compliance
- **Active session management**

**API Endpoints:**
```
POST   /platform/support/impersonate           - Start impersonation
DELETE /platform/support/impersonate/:id       - End impersonation
GET    /platform/support/impersonate/active    - List active sessions
GET    /platform/support/impersonate/history   - Impersonation history
```

### 3. Audit Logging

Immutable audit logs for all platform operations:

- **Append-only** logs (never modified or deleted)
- **Comprehensive tracking**: who, what, when, why
- **Before/after snapshots** for changes
- **Success/failure** tracking
- **IP address and user agent** logging

**API Endpoints:**
```
GET    /platform/audit/logs    - Query audit logs with filters
```

### 4. Security Features

#### Mandatory Requirements
- **MFA required** for all platform users
- **IP allowlist** support
- **Device fingerprinting**
- **Session management** with automatic expiry
- **Reason codes** for sensitive operations

#### Guards and Decorators

```typescript
// Require platform context
@RequireContext(ContextType.PLATFORM)

// Require specific permissions
@RequirePlatformPermissions(PlatformPermission.TENANTS_DELETE)

// Require reason for sensitive operations
@RequireReason()
@UseGuards(RequireReasonGuard)

// Allow tenant isolation bypass (use carefully)
@AllowTenantBypass()
```

## Database Schema

### New Tables

1. **platform_users** - Platform administrator accounts
2. **platform_sessions** - Platform login sessions
3. **platform_audit_logs** - Immutable audit trail
4. **impersonation_sessions** - Track all impersonation
5. **tenant_lifecycle_events** - Tenant state changes

### Extended Tables

**tenants** table now includes:
- Billing information (Stripe IDs)
- Subscription details
- Suspension tracking
- Metrics (users, bookings, revenue, MRR)
- Risk and health scores
- Feature flags and metadata

## Usage Examples

### 1. Creating a Platform User

```typescript
// This would be done through a seed script or direct DB insert
// Platform users are not created through API for security
const platformUser = {
  email: 'admin@erp.soft-y.org',
  fullName: 'Platform Admin',
  passwordHash: await passwordHashService.hash('SecurePassword123!'),
  role: PlatformRole.SUPER_ADMIN,
  mfaEnabled: true,
};
```

### 2. Listing Tenants with Filters

```bash
GET /platform/tenants?status=ACTIVE&plan=PREMIUM&limit=20
Authorization: Bearer <platform_jwt>
```

### 3. Suspending a Tenant

```bash
POST /platform/tenants/tenant-id/suspend
Authorization: Bearer <platform_jwt>
Content-Type: application/json

{
  "reason": "Payment failed for 3 consecutive months",
  "gracePeriodDays": 7
}
```

### 4. Starting Impersonation

```bash
POST /platform/support/impersonate
Authorization: Bearer <platform_jwt>
Content-Type: application/json

{
  "tenantId": "tenant-uuid",
  "userId": "user-uuid",
  "reason": "Customer reported billing issue, need to investigate",
  "approvalTicketId": "TICKET-12345"
}
```

Response:
```json
{
  "sessionId": "session-uuid",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "4h",
  "targetUser": {
    "id": "user-uuid",
    "email": "user@tenant.com"
  },
  "warning": "All actions performed during this session are logged and monitored"
}
```

### 5. Querying Audit Logs

```bash
GET /platform/audit/logs?action=TENANT_SUSPENDED&startDate=2026-01-01&limit=50
Authorization: Bearer <platform_jwt>
```

## Security Considerations

### 1. Tenant Isolation

The platform module uses explicit bypass mechanisms to access cross-tenant data:

```typescript
@AllowTenantBypass()  // Must be explicitly declared
async listTenants() {
  // Can query across all tenants
}
```

### 2. Reason Codes

Sensitive operations require a reason:

```typescript
@RequireReason()
async deleteTenant(id: string, dto: DeleteTenantDto, @Req() req: any) {
  const reason = req.validatedReason; // Validated by guard
  // ... perform deletion
}
```

### 3. Audit Everything

Every platform action is logged:

```typescript
await this.auditService.log({
  platformUserId: req.user.userId,
  action: PlatformAction.TENANT_SUSPENDED,
  targetTenantId: tenantId,
  ipAddress: req.ip,
  reason: dto.reason,
  changesBefore: { status: 'ACTIVE' },
  changesAfter: { status: 'SUSPENDED' },
});
```

## Development

### Running Migrations

```bash
# Generate migration
npm run migration:generate -- CreatePlatformTables

# Run migrations
npm run migration:run

# Revert migration
npm run migration:revert
```

### Testing

```bash
# Unit tests
npm run test platform

# E2E tests
npm run test:e2e platform

# Test coverage
npm run test:cov
```

## Deployment

### Environment Variables

Required platform-specific variables:

```bash
# Platform JWT secret (separate from tenant JWT)
PLATFORM_JWT_SECRET=<strong-secret-256-bits>

# Platform session duration (seconds)
PLATFORM_SESSION_DURATION=28800  # 8 hours

# Impersonation session duration (seconds)
IMPERSONATION_SESSION_DURATION=14400  # 4 hours
```

### Database Indexes

The migration creates optimized indexes for:
- Tenant search by status, plan, risk score
- Audit log queries by user, action, time
- Impersonation session tracking
- Session management and cleanup

### Monitoring

Key metrics to monitor:
- Active impersonation sessions count
- Suspended tenants count
- Failed authentication attempts
- Audit log write latency
- Platform API response times

## Roadmap

### Phase 2 Features (Future)
- [ ] Billing reconciliation automation
- [ ] Revenue analytics dashboard
- [x] Tenant health scoring algorithm
- [ ] Automated compliance reporting (GDPR, CCPA)
- [x] Advanced security policies (IP restrictions, 2FA enforcement)
- [ ] Bulk tenant operations
- [ ] Platform user management UI
- [ ] WebSocket real-time notifications
- [ ] Export tenant data (GDPR Article 20)
- [ ] Legal hold management

### Phase 3 Features (Future)
- [ ] Multi-region tenant management
- [ ] Automated fraud detection
- [ ] Predictive churn analysis
- [ ] Self-service tenant portal
- [ ] Advanced role customization (ABAC)
- [ ] Integration with external identity providers
- [ ] Automated tenant provisioning workflows

## Support

For platform-related issues:
1. Check the audit logs for detailed action history
2. Review impersonation session logs
3. Verify platform user permissions
4. Check database migrations are up to date

## License

Proprietary - Internal use only
