# API Security Guidelines

## 1. Authentication & Session Management

### 1.1 JWT Authentication
- **Mechanism**: All API endpoints (except public/webhook routes) require a valid JSON Web Token (JWT) in the `Authorization` header (`Bearer <token>`).
- **Token Claims**: Tokens must contain:
  - `sub`: User ID
  - `email`: User Email
  - `role`: User Role
  - `tenantId`: Tenant Context (Critical for isolation)
- **Validation**:
  - Tokens are signed with a strong secret (`JWT_SECRET`).
  - Expiration (`exp`) is strictly enforced (default: 15m for access tokens).
  - Algorithm: HS256 (ensure no "none" alg is accepted).

### 1.2 Multi-Factor Authentication (MFA)
- **Requirement**: Admins and sensitive roles should enable MFA.
- **Provider**: TOTP-based (Google Authenticator, Authy).
- **Recovery**: Backup codes are generated upon MFA setup.

### 1.3 Account Security
- **Lockout Policy**: Accounts are locked for 15 minutes after 5 failed login attempts.
- **Password Policy**: Minimum 10 characters, mixed case, numbers, and symbols. Users are forced to reset passwords seeded by admins.

---

## 2. Authorization & Access Control

### 2.1 Role-Based Access Control (RBAC)
Supported Roles:
- `ADMIN`: Full system access within their tenant.
- `OPS_MANAGER`: Operational access (Users, Bookings, Finance) but limited system config.
- `FIELD_STAFF`: Limited access to assigned Tasks and personal Profile/Wallet.

### 2.2 Tenant Isolation (Critical)
- **Principle**: "Shared Database, Separate Schemas" logic enforced via Row-Level Security pattern.
- **Implementation**:
  - `TenantContextService` extracts `tenantId` from the JWT.
  - **ALL** database queries must inject `where: { tenantId }`.
  - Composite Foreign Keys (e.g., `(tenantId, userId)`) are used to prevent cross-tenant references at the database level.
  - **NEVER** trust `tenantId` from request bodies or client-provided headers; always source it from the authenticated token.

---

## 3. Input Validation & Data Hygiene

### 3.1 Strict DTO Validation
- **Tool**: `class-validator` + `ValidationPipe`.
- **Rules**:
  - `whitelist: true`: Strip unrecognized properties (Mass Assignment prevention).
  - `forbidNonWhitelisted: true`: Reject requests with unknown fields.
  - Use specific decorators: `@IsEmail()`, `@IsUUID()`, `@IsPositive()`, `@Min()`.

### 3.2 Mass Assignment Protection
- **Vulnerability**: Attackers injecting fields like `isAdmin: true` or `balance: 1000000` into update payloads.
- **Defense**:
  1. **DTO Whitelisting**: First line of defense.
  2. **Explicit Assignment**: In Service layers, explicitly map DTO fields to Entity fields. avoid `Object.assign(entity, dto)` unless the DTO is strictly controlled.
     ```typescript
     // Safe Pattern
     user.email = dto.email;
     user.firstName = dto.firstName;
     // Do NOT assign user.role = dto.role automatically for non-admins
     ```

### 3.3 HTML Sanitization
- **Risk**: Stored Cross-Site Scripting (XSS).
- **Defense**: Use `@SanitizeHtml()` decorator on all user-submitted text fields (notes, descriptions, comments).
- **Library**: `sanitize-html` removes `<script>`, `<iframe>`, `on*` attributes.

---

## 4. Output Security

### 4.1 PII Masking
- **Sensitive Data**: Emails, Phone Numbers, Addresses, Salaries.
- **Logging**: Use `@PII()` decorator in entities/DTOs. The structured logger (Winston) detects this and masks the value (e.g., `j***@example.com`) before writing to logs.
- **API Responses**: Use `ClassSerializerInterceptor` + `@Exclude()` to hide internal fields (`passwordHash`, `mfaSecret`) from JSON responses.

### 4.2 Error Handling
- **Production Mode**: unexpected errors return `500 Internal Server Error` with a generic message. Stack traces are **never** exposed.
- **Correlation IDs**: Every error includes a `correlationId` to trace the log entry without exposing details to the client.

### 4.3 HTTP Headers (Helmet)
- `Content-Security-Policy`: Prevent loading malicious scripts.
- `X-Frame-Options`: `DENY` (Prevent clickjacking).
- `Strict-Transport-Security`: Enforce HTTPS.
- `X-Content-Type-Options`: `nosniff`.

---

## 5. Rate Limiting & Denial of Service

### 5.1 Throttling
- **Standard**: 100 requests per minute per IP.
- **Sensitive Endpoints** (Login, Password Reset): 5 requests per minute.
- **Guard**: `ThrottlerGuard` is applied globally or per-controller.

### 5.2 Payload Limits
- JSON Body: 100kb limit.
- File Uploads: Verified by mime-type and strict size limits (e.g., 5MB for images).
