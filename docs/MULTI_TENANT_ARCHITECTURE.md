# Multi-Tenant Architecture Documentation

## Overview

Chapters Studio ERP implements **tenant-based data isolation** using AsyncLocalStorage for request-scoped tenant context. Every tenant operates in complete isolation with their own data.

## Authentication Flow

```
┌─────────────┐   1. Register     ┌─────────────┐
│   Client    │ ─────────────────▶│  /register  │
│             │   (no header)     │             │
│             │◀──────────────────│             │
│             │    JWT + tenantId │             │
└─────────────┘                   └─────────────┘

┌─────────────┐   2. Login        ┌─────────────┐
│   Client    │ ─────────────────▶│   /login    │
│             │  X-Tenant-ID      │             │
│             │◀──────────────────│             │
│             │    JWT + tenantId │             │
└─────────────┘                   └─────────────┘

┌─────────────┐   3. API Calls    ┌─────────────┐
│   Client    │ ─────────────────▶│ /api/v1/*   │
│             │  Authorization    │             │
│             │  Bearer <JWT>     │             │
└─────────────┘                   └─────────────┘
```

## Tenant Context Extraction

The `TenantMiddleware` extracts tenant context from two sources:

1. **JWT Payload (preferred)** - For authenticated requests
2. **X-Tenant-ID Header** - For login/unauthenticated requests

```typescript
// Priority: JWT > Header (prevents header spoofing)
const tenantId = tenantIdFromJwt || tenantIdHeader;
```

## JWT Token Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "ADMIN",
  "tenantId": "tenant-uuid",
  "iat": 1704067200,
  "exp": 1704068100
}
```

## Security Features

### Account Lockout (Brute Force Protection)
- **Max Attempts**: 5 (configurable via `LOCKOUT_MAX_ATTEMPTS`)
- **Lockout Duration**: 30 minutes (configurable via `LOCKOUT_DURATION_MS`)
- **Attempt Window**: 15 minutes (configurable via `LOCKOUT_WINDOW_MS`)

### Rate Limiting
- **Login/Register**: 5 requests per minute per IP
- **General API**: 100 requests per minute per IP

### Input Sanitization
- All string inputs are sanitized via `SanitizeInterceptor`
- HTML special characters escaped: `& < > " ' /`

### Password Complexity
Registration requires:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (`@$!%*?&`)

## API Endpoints

### Public Endpoints (No Auth Required)
| Endpoint | Headers | Description |
|----------|---------|-------------|
| `POST /api/v1/auth/register` | - | Create new tenant + admin user |
| `POST /api/v1/auth/login` | X-Tenant-ID | Login to existing tenant |
| `GET /api/v1/health` | - | Health check |

### Protected Endpoints (JWT Required)
| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/auth/me` | Get current user |
| `GET /api/v1/auth/sessions` | List active sessions |
| `POST /api/v1/auth/logout` | Revoke token |
| `GET /api/v1/packages` | List service packages |
| `GET /api/v1/bookings` | List bookings |
| ... | All other endpoints |

## Environment Variables

```bash
# Auth Configuration
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRES=900
JWT_REFRESH_EXPIRES=604800

# Account Lockout
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MS=1800000
LOCKOUT_WINDOW_MS=900000

# CORS (comma-separated for production)
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

## Data Isolation

All tenant-scoped entities extend `BaseTenantEntity`:

```typescript
@Entity()
export class Booking extends BaseTenantEntity {
  @Column()
  tenantId: string; // Automatically filtered
  
  // ...
}
```

Queries automatically filter by tenant context:
```typescript
// TenantContextService.getTenantId() used in all queries
const bookings = await this.bookingRepo.find({
  where: { tenantId: TenantContextService.getTenantId() }
});
```
