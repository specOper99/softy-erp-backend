import { execSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

interface SwaggerBuildMeta {
  commitSha: string;
  generatedAt: string;
}

function resolveDocsCommitSha(): string {
  const commitFromEnv = process.env.SOURCE_COMMIT ?? process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (commitFromEnv?.trim()) {
    return commitFromEnv.trim().slice(0, 12);
  }

  try {
    const commitSha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    return commitSha || 'unknown';
  } catch {
    return 'unknown';
  }
}

function buildSwaggerMeta(): SwaggerBuildMeta {
  return {
    commitSha: resolveDocsCommitSha(),
    generatedAt: new Date().toISOString(),
  };
}

function createStrictCspDirectives() {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(process.env.CSP_REPORT_URI ? { reportUri: process.env.CSP_REPORT_URI } : {}),
  };
}

function createStrictHelmet(isProd: boolean) {
  const strictCspDirectives = createStrictCspDirectives();

  return helmet({
    contentSecurityPolicy: {
      directives: strictCspDirectives,
      reportOnly: false,
    },
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : { maxAge: 86400, includeSubDomains: false },
    crossOriginResourcePolicy: isProd ? { policy: 'same-site' } : false,
    crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xFrameOptions: { action: 'deny' },
    xXssProtection: false,
  });
}

function createSwaggerHelmet(isProd: boolean) {
  const strictCspDirectives = createStrictCspDirectives();

  return helmet({
    contentSecurityPolicy: {
      directives: {
        ...strictCspDirectives,
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
      reportOnly: false,
    },
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : { maxAge: 86400, includeSubDomains: false },
    crossOriginResourcePolicy: isProd ? { policy: 'same-site' } : false,
    crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xFrameOptions: { action: 'deny' },
    xXssProtection: false,
  });
}

function applyDocsSecurityHeaders(res: Response, meta: SwaggerBuildMeta): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Docs-Commit', meta.commitSha);
  res.setHeader('X-Docs-Generated-At', meta.generatedAt);
}

function setupSwaggerSecurityMiddleware(
  app: INestApplication,
  options: {
    isProd: boolean;
    swaggerEnabled: boolean;
    meta: SwaggerBuildMeta;
  },
) {
  const strictHelmet = createStrictHelmet(options.isProd);
  const swaggerHelmet = createSwaggerHelmet(options.isProd);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isSwaggerDocsRoute =
      req.path === '/api/docs' ||
      req.path.startsWith('/api/docs/') ||
      req.path === '/api/docs-json' ||
      req.path === '/api/docs-yaml';

    if (options.swaggerEnabled && isSwaggerDocsRoute) {
      applyDocsSecurityHeaders(res, options.meta);
      return swaggerHelmet(req, res, next);
    }

    return strictHelmet(req, res, next);
  });
}

function buildSwaggerDocumentConfig() {
  return new DocumentBuilder()
    .setTitle(process.env.APP_NAME || 'SaaS ERP API')
    .setDescription(
      `API for ${process.env.COMPANY_NAME || 'SaaS Platform'} - Manages Bookings, Field Tasks, Finance, and HR/Payroll.

## API Contexts

This API supports three distinct contexts:

### 🏢 Tenant Context (Business Operations)
Regular business users access tenant-scoped endpoints. JWT tokens have \`audience: "tenant"\`.

### 👑 Platform Context (Superadmin)
Platform administrators access \`/platform/*\` endpoints for SaaS management. JWT tokens have \`audience: "platform"\`. **MFA is mandatory.**

### 🔓 Public Context
Unauthenticated endpoints for registration, login, and public resources.

### CSRF
This API uses Authorization Bearer tokens and does not require CSRF tokens.

## Rate Limit Contract

- 429 responses include \`Retry-After\` header with retry seconds.
- Common throttled responses: \`Too many requests\` or \`Too many requests. Blocked for N seconds.\`

## Role Hierarchy

| Context | Roles | Access Level |
|---------|-------|--------------|
| Platform | SUPER_ADMIN | Full platform access |
| Platform | SUPPORT_ADMIN | Impersonation, view logs, suspend tenants |
| Platform | BILLING_ADMIN | Subscriptions, refunds, revenue |
| Platform | SECURITY_ADMIN | Lock tenants, force password reset |
| Platform | COMPLIANCE_ADMIN | GDPR export/delete, audit logs |
| Platform | ANALYTICS_VIEWER | Read-only metrics |
| Tenant | ADMIN | Full tenant access |
| Tenant | OPS_MANAGER | Operations management |
| Tenant | FIELD_STAFF | Task execution |
| Tenant | CLIENT | Portal access only |

### Tenant Admin - User Creation Guidance

Tenant Admin can create studio-side users primarily with roles: \`OPS_MANAGER\`, \`FIELD_STAFF\`, and \`CLIENT\`.
`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Enter JWT token' },
      'tenant-auth',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Platform Admin JWT (MFA required)' },
      'platform-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-client-token',
        description: 'Client portal access token (magic-link session)',
      },
      'client-token',
    )
    .addTag('Auth', '🔓 Authentication - Login, Register, Password Reset')
    .addTag('Client Portal', '🔓 Client-facing portal with Magic Link auth')
    .addTag('Users', '🏢 [Tenant] User management')
    .addTag('Service Packages', '🏢 [Tenant] Catalog - Service packages')
    .addTag('Task Types', '🏢 [Tenant] Catalog - Task type definitions')
    .addTag('Bookings', '🏢 [Tenant] Booking management and workflows')
    .addTag('Tasks', '🏢 [Tenant] Task assignment and completion')
    .addTag('Finance - Transactions', '🏢 [Tenant] Financial transactions')
    .addTag('Finance - Wallets', '🏢 [Tenant] Employee commission wallets')
    .addTag('HR', '🏢 [Tenant] HR and Payroll management')
    .addTag('Dashboard', '🏢 [Tenant] Reporting and analytics dashboard')
    .addTag('Audit', '🏢 [Tenant] System audit logs')
    .addTag('Metrics', '🏢 [Tenant] System performance metrics')
    .addTag('Platform - Auth', '👑 [Superadmin] Platform authentication (MFA required)')
    .addTag('Platform - Tenants', '👑 [Superadmin] Tenant lifecycle management')
    .addTag('Platform - Support', '👑 [Superadmin] Impersonation and support tools')
    .addTag('Platform - Security', '👑 [Superadmin] Security operations (password reset, session revoke)')
    .addTag('Platform - Analytics', '👑 [Superadmin] Platform-wide metrics and revenue')
    .addTag('Platform - Audit', '👑 [Superadmin] Platform audit logs')
    .addTag('Platform - MFA', '👑 [Superadmin] Multi-factor authentication setup')
    .setLicense(`Private - ${process.env.COMPANY_NAME || 'Softy'}`, process.env.COMPANY_URL || 'https://erp.soft-y.org')
    .build();
}

function setupSwaggerDocumentation(app: INestApplication, meta: SwaggerBuildMeta): void {
  const config = buildSwaggerDocumentConfig();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  document.info.version = `${document.info.version}+${meta.commitSha}`;
  document.info.description = `${document.info.description}\n\n---\nDocs build: ${meta.commitSha} @ ${meta.generatedAt}`;

  Object.assign(document, {
    'x-docs-build': {
      commitSha: meta.commitSha,
      generatedAt: meta.generatedAt,
    },
  });

  SwaggerModule.setup('api/docs', app, document);
}

export function configureSwagger(app: INestApplication, options: { isProd: boolean; swaggerEnabled: boolean }): void {
  const meta = buildSwaggerMeta();

  setupSwaggerSecurityMiddleware(app, {
    isProd: options.isProd,
    swaggerEnabled: options.swaggerEnabled,
    meta,
  });

  if (!options.swaggerEnabled) {
    return;
  }

  setupSwaggerDocumentation(app, meta);
}
