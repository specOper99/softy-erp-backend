# Security Hardening Guide

## Overview

This document provides comprehensive security hardening guidelines for the Chapters Studio ERP system. It covers authentication, authorization, data protection, network security, and operational security practices.

---

## Table of Contents

1. [Authentication Security](#authentication-security)
2. [Authorization and Access Control](#authorization-and-access-control)
3. [Data Protection](#data-protection)
4. [Input Validation](#input-validation)
5. [Network Security](#network-security)
6. [Infrastructure Security](#infrastructure-security)
7. [Operational Security](#operational-security)
8. [Security Checklist](#security-checklist)

---

## Authentication Security

### JWT Token Configuration

**Critical Settings:**

| Setting                | Recommended Value        | Risk if Improperly Set              |
| ---------------------- | ------------------------ | ----------------------------------- |
| Access Token Lifetime  | 15 minutes (900 seconds) | Longer = higher exposure window     |
| Refresh Token Lifetime | 7 days (with rotation)   | Longer = extended attack window     |
| Token Algorithm        | RS256 (asymmetric)       | HS256 = key compromise disaster     |
| Minimum RSA Key Length | 2048 bits                | 1024 bits = vulnerable to factoring |

**Implementation:**

```typescript
// src/config/auth.config.ts
export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpires: parseInt(
    process.env.JWT_ACCESS_EXPIRES_SECONDS || '900',
    10,
  ),
  jwtRefreshExpires: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10),
  // Use RS256 for production
  jwtAlgorithm: process.env.NODE_ENV === 'production' ? 'RS256' : 'HS256',
}));
```

### Password Security

**Requirements:**

| Requirement              | Specification                                                    |
| ------------------------ | ---------------------------------------------------------------- |
| Minimum Length           | 8 characters                                                     |
| Maximum Length           | 128 characters                                                   |
| Complexity               | Must contain uppercase, lowercase, number, and special character |
| Bcrypt Cost              | Minimum 10, recommended 12                                       |
| Maximum Login Attempts   | 5 per 15 minutes                                                 |
| Account Lockout Duration | 15 minutes                                                       |

**Implementation:**

```typescript
// src/modules/users/services/users.service.ts
async createUser(createUserDto: CreateUserDto): Promise<User> {
  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
  if (!passwordRegex.test(createUserDto.password)) {
    throw new BadRequestException('user.password_weak');
  }

  // Hash with appropriate cost factor
  const passwordHash = await bcrypt.hash(createUserDto.password, 12);

  // ... create user
}
```

### Multi-Factor Authentication (MFA)

**MFA Requirements by Role:**

| Role        | MFA Requirement           |
| ----------- | ------------------------- |
| ADMIN       | Mandatory                 |
| OPS_MANAGER | Mandatory                 |
| FIELD_STAFF | Optional                  |
| CLIENT      | Optional (via magic link) |

**MFA Implementation:**

```typescript
// src/modules/auth/services/mfa.service.ts
@Injectable()
export class MfaService {
  async generateSecret(
    user: User,
  ): Promise<{ secret: string; qrCodeUrl: string }> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(
      user.email,
      'Chapters Studio ERP',
      secret,
    );
    const qrCodeUrl = await toDataURL(otpauthUrl);

    return { secret, qrCodeUrl };
  }

  async verify(user: User, token: string): Promise<boolean> {
    try {
      return authenticator.verify({
        token,
        secret: user.mfaSecret,
      });
    } catch {
      return false;
    }
  }
}
```

### Session Management

**Refresh Token Security:**

```typescript
// src/modules/auth/entities/refresh-token.entity.ts
@Entity('refresh_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['userId', 'expiresAt'])
export class RefreshToken extends BaseEntity {
  @Column({ name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'is_revoked', default: false })
  isRevoked: boolean;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ name: 'user_agent', nullable: true, length: 500 })
  userAgent: string;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  isValid(): boolean {
    return !this.isRevoked && new Date() < this.expiresAt;
  }
}
```

---

## Authorization and Access Control

### Role-Based Access Control (RBAC)

**Role Hierarchy:**

```
ADMIN (Superuser)
├── Can access all resources
├── Can manage all users
└── Can configure system settings

OPS_MANAGER (Operations)
├── Can manage bookings
├── Can manage tasks
├── Can view reports
└── Can manage field staff

FIELD_STAFF (Field Workers)
├── Can view assigned tasks
├── Can update task status
└── Can view own wallet

CLIENT (External Users)
├── Can view own bookings
├── Can view own profile
└── Cannot access internal resources
```

**Implementation:**

```typescript
// src/common/decorators/roles.decorator.ts
export enum Role {
  ADMIN = 'ADMIN',
  OPS_MANAGER = 'OPS_MANAGER',
  FIELD_STAFF = 'FIELD_STAFF',
  CLIENT = 'CLIENT',
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

### Tenant-Level Authorization

**Composite Foreign Key Constraints:**

```sql
-- Database migration
ALTER TABLE users
ADD CONSTRAINT FK_users_tenant
FOREIGN KEY (id, tenant_id)
REFERENCES tenants(id, id)
ON DELETE CASCADE;

ALTER TABLE transactions
ADD CONSTRAINT FK_transactions_tenant
FOREIGN KEY (id, tenant_id)
REFERENCES tenants(id, id)
ON DELETE CASCADE;
```

**Query-Level Filtering:**

```typescript
// src/common/services/tenant-context.service.ts
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<TenantContext>();

  static getTenantId(): string {
    const tenantId = this.storage.getStore()?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('common.tenant_missing');
    }
    return tenantId;
  }

  static run<T>(tenantId: string, callback: () => T): T {
    return this.storage.run({ tenantId }, callback);
  }
}

// Usage in repository queries
async findUserById(id: string): Promise<User> {
  const tenantId = TenantContextService.getTenantId();
  return this.userRepository.findOne({
    where: { id, tenantId },
  });
}
```

---

## Data Protection

### Sensitive Data Classification

| Classification | Examples                                    | Handling                                        |
| -------------- | ------------------------------------------- | ----------------------------------------------- |
| **Critical**   | Passwords, MFA secrets, encryption keys     | Never log, encrypt at rest, hash before storage |
| **Sensitive**  | PII (email, phone, address), financial data | Mask in logs, encrypt at rest                   |
| **Internal**   | Internal IDs, system names                  | Standard logging                                |
| **Public**     | Booking status, public profiles             | Standard handling                               |

### PII Masking in Logs

```typescript
// src/common/decorators/pii.decorator.ts
export const PII_KEY = 'pii';
export const Pii = () => SetMetadata(PII_KEY, true);

// src/common/interceptors/audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly sensitiveKeys = [
    'password',
    'token',
    'secret',
    'mfa',
    'code',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object') {
          return this.maskSensitiveData(data);
        }
        return data;
      }),
    );
  }

  private maskSensitiveData(
    obj: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...obj };
    for (const key of Object.keys(sanitized)) {
      if (this.sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}
```

### Encryption at Rest

**Webhook Secrets Encryption:**

```typescript
// src/modules/webhooks/entities/webhook.entity.ts
@Entity('webhooks')
export class Webhook extends BaseEntity {
  @Column({ name: 'secret', nullable: true, select: false })
  secret: string;

  @Column({ name: 'secret_version', default: 'v1' })
  secretVersion: string;
}

// src/common/services/encryption.service.ts
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly currentVersion = 'v2';

  encrypt(plaintext: string): string {
    const key = this.getCurrentKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: version:iv:tag:encrypted
    return `${this.currentVersion}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [version, ivHex, tagHex, encryptedHex] = ciphertext.split(':');

    const key =
      version === this.currentVersion
        ? this.getCurrentKey()
        : this.getLegacyKey();
    const decipher = createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    return (
      decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8')
    );
  }
}
```

---

## Input Validation

### DTO Validation Rules

**CreateTransactionDto:**

```typescript
// src/modules/finance/dto/create-transaction.dto.ts
export class CreateTransactionDto {
  @IsEnum(TransactionType)
  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @IsNumber()
  @Min(0.01)
  @Max(999999999.99)
  @ApiProperty({ minimum: 0.01, maximum: 999999999.99 })
  amount: number;

  @IsEnum(Currency)
  @IsOptional()
  @ApiProperty({ enum: Currency, required: false })
  currency?: Currency;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @ApiProperty({ maxLength: 100, required: false })
  category?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ required: false })
  transactionDate?: string;
}
```

### Sanitization

**HTML Sanitization:**

```typescript
// src/common/decorators/sanitize-html.decorator.ts
export const SANITIZE_HTML_KEY = 'sanitizeHtml';
export const SanitizeHtml = () => SetMetadata(SANITIZE_HTML_KEY, true);

// Usage on DTO properties
export class CreateBookingDto {
  @IsString()
  @SanitizeHtml()
  @ApiProperty({ description: 'Booking notes (HTML will be sanitized)' })
  notes: string;
}
```

### SQL Injection Prevention

**TypeORM Query Builder (Safe):**

```typescript
// SAFE - Uses parameterized queries
const user = await this.userRepository
  .createQueryBuilder('user')
  .where('user.email = :email', { email: userInput })
  .andWhere('user.tenantId = :tenantId', { tenantId })
  .getOne();
```

**Raw Queries (Use with Caution):**

```typescript
// If raw query is necessary, use parameterized queries
const result = await this.dataSource.manager.query(
  `SELECT * FROM users WHERE email = $1 AND tenant_id = $2`,
  [email, tenantId],
);
```

---

## Network Security

### CORS Configuration

```typescript
// src/main.ts
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim());

app.enableCors({
  origin: process.env.NODE_ENV === 'production' ? corsOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
});
```

### Helmet Security Headers

```typescript
// src/main.ts
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === 'production' ? undefined : false,
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
```

### Rate Limiting

```typescript
// src/common/guards/ip-rate-limit.guard.ts
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly limits = {
    global: { limit: 100, windowMs: 60000 },
    auth: { limit: 5, windowMs: 900000 },
    api: { limit: 1000, windowMs: 60000 },
  };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ip = context.switchToHttp().getRequest().ip;
    const endpoint = this.classifyEndpoint(context.switchToHttp().getRequest());

    const key = `ratelimit:${endpoint}:${ip}`;
    const { limit, windowMs } = this.limits[endpoint];

    const requests = await this.cacheService.incr(key);
    if (requests === 1) {
      await this.cacheService.expire(key, windowMs);
    }

    if (requests > limit) {
      throw new TooManyRequestsException();
    }

    return true;
  }
}
```

---

## Infrastructure Security

### Docker Security

**Dockerfile:**

```dockerfile
# Use non-root user
FROM node:20-alpine AS builder
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci && npm run build

FROM node:20-alpine AS runner
WORKDIR /home/node

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy from builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# Switch to non-root user
USER nestjs

EXPOSE 3000
CMD ["node", "dist/main"]
```

### Environment Variables

**Production Environment (.env):**

```bash
# CRITICAL: Never commit these to version control
NODE_ENV=production
DB_HOST=prod-db.example.com
DB_PASSWORD=your-secure-password-here
JWT_SECRET=$(openssl rand -hex 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=your-vault-token

# Security settings
DB_SYNCHRONIZE=false
ENABLE_SWAGGER=false
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

### Secrets Management

**HashiCorp Vault Integration:**

```typescript
// src/config/vault.loader.ts
export const vaultLoader = async () => {
  if (process.env.VAULT_ENABLED !== 'true') {
    return {};
  }

  const client = vault({
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
  });

  const secrets = await client.read(process.env.VAULT_SECRET_PATH);

  return {
    database: {
      password: secrets.data.database_password,
    },
    jwt: {
      secret: secrets.data.jwt_secret,
    },
  };
};
```

---

## Operational Security

### Logging and Monitoring

**Structured Logging:**

```typescript
// src/common/logger/logger.service.ts
@Injectable()
export class LoggerService {
  private readonly logger = new Logger(LoggerService.name);

  logSecurityEvent(event: SecurityEvent): void {
    this.logger.warn({
      eventType: event.type,
      userId: event.userId,
      tenantId: event.tenantId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      message: event.message,
    });
  }

  logDataAccess(operation: string, resource: string, userId: string): void {
    this.logger.info({
      eventType: 'DATA_ACCESS',
      operation,
      resource,
      userId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### Security Events to Monitor

| Event                      | Severity | Action                         |
| -------------------------- | -------- | ------------------------------ |
| Multiple failed logins     | Warning  | Alert after 5 attempts         |
| Account lockout            | Warning  | Log, consider notification     |
| Password reset request     | Info     | Log, send notification         |
| MFA disabled               | High     | Log, send notification         |
| New device login           | Info     | Log, send notification         |
| Impossible travel detected | High     | Alert, consider account review |
| Token reuse detected       | Critical | Alert, revoke all sessions     |
| Suspicious API patterns    | High     | Alert, consider blocking       |

### Incident Response

**Security Incident分类:**

| Level         | Description                            | Response Time      |
| ------------- | -------------------------------------- | ------------------ |
| P1 - Critical | Data breach, system compromise         | Immediate (15 min) |
| P2 - High     | Unauthorized access attempt, injection | 1 hour             |
| P3 - Medium   | Policy violation, suspicious activity  | 4 hours            |
| P4 - Low      | Minor policy violation                 | 24 hours           |

---

## Security Checklist

### Pre-Deployment Checklist

- [ ] All critical vulnerabilities fixed (CR-001, CR-002, CR-003)
- [ ] JWT secrets are strong (minimum 64 characters, high entropy)
- [ ] Database synchronization disabled in production
- [ ] CORS configured with specific origins (not `*` in production)
- [ ] Helmet security headers enabled
- [ ] Rate limiting configured
- [ ] MFA mandatory for ADMIN and OPS_MANAGER roles
- [ ] Password complexity requirements enforced
- [ ] PII masking enabled in logs
- [ ] Sensitive data encrypted at rest
- [ ] Secrets stored in HashiCorp Vault (or secure secret manager)
- [ ] Environment variables validated at startup
- [ ] Security scanning passed (npm audit, snyk)
- [ ] Dependencies up to date (no critical CVEs)
- [ ] SSL/TLS configured for all external services
- [ ] Audit logging enabled for all sensitive operations

### Ongoing Security Tasks

- [ ] Weekly dependency vulnerability scan
- [ ] Monthly access review
- [ ] Quarterly penetration testing
- [ ] Annual security architecture review
- [ ] Incident response plan testing
- [ ] Security training for developers

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [TypeORM Security Best Practices](https://typeorm.io/security)
- [NestJS Security](https://docs.nestjs.com/security)

---

_Document Version: 1.0.0_  
_Last Updated: January 8, 2026_  
_Next Review: April 8, 2026_
