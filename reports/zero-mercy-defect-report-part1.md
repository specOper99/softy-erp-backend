# Zero-Mercy Defect Report (Part 1 - Backend)

`@backend/` does not exist in this workspace. The backend code lives under `backend/` (nested repo: `backend/.git` exists).

---

## Section 1: Executive Summary

### System Health Score (0-10)
**4.0 / 10** (based on bootstrap/config/security plumbing inspected so far)

### Total Defect Count (by severity)
(Counts reflect inspected files only: `backend/src/main.ts`, `backend/src/instrument.ts`, `backend/src/app.module.ts`, `backend/src/config/auth.config.ts`, `backend/src/config/database.config.ts`, `backend/src/config/env-validation.ts`, `backend/src/config/vault.loader.ts`, `backend/src/common/filters/all-exceptions.filter.ts`, `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/services/token.service.ts`, `backend/src/modules/auth/services/token-blacklist.service.ts`, `backend/src/modules/auth/entities/refresh-token.entity.ts`, `backend/src/modules/auth/strategies/jwt.strategy.ts`, `backend/src/modules/auth/guards/jwt-auth.guard.ts`, `backend/src/modules/auth/guards/ws-jwt.guard.ts`, `backend/src/common/middleware/csrf.middleware.ts`, `backend/src/modules/tenants/middleware/tenant.middleware.ts`, `backend/src/common/guards/ip-rate-limit.guard.ts`, plus repo hygiene artifacts visible in `backend/`)

- **CRITICAL**: 4
- **HIGH**: 35
- **MEDIUM**: 48
- **LOW**: 13
- **TOTAL**: 100

---

## Section 2: The Exhaustive Defect Ledger

Format: `[Severity] [File:Line] - Issue Description`

### Repo / Hygiene / Supply Chain

- [HIGH] [backend/.env:1] - Secret-bearing dotenv file present in repository; worst-case: committed credentials/tokens. (Not echoing contents.)
- [MEDIUM] [backend/.env.test:1] - Test dotenv present; worst-case: contains real secrets reused in non-test contexts. (Not echoing contents.)
- [MEDIUM] [backend/.env.example:1] - Example env file present; often leaks "near-real" secrets/hostnames and becomes operational truth.
- [LOW] [backend/.DS_Store:1] - OS artifact committed; indicates missing `.gitignore` hygiene and increases diff noise.
- [LOW] [backend/src/.DS_Store:1] - OS artifact committed under source tree; same hygiene failure.
- [LOW] [backend/src/database/.DS_Store:1] - OS artifact committed under source tree; same hygiene failure.

### Bootstrap / Platform Hardening (`backend/src/main.ts`)

- [CRITICAL] [backend/src/main.ts:196] - `void bootstrap();` drops the Promise without a terminal `.catch(...)`; any startup failure becomes an unhandled rejection -> process crash / undefined startup state.
- [HIGH] [backend/src/main.ts:14] - `initTracing()` runs unconditionally before app config validation/bootstrapping; worst-case: telemetry initialization throws and blocks startup; also risks exporting traces unexpectedly in non-prod.
- [HIGH] [backend/src/main.ts:39] - Non-production CSP explicitly allows `'unsafe-inline'` and `'unsafe-eval'`; worst-case: Swagger UI exposure + any reflected injection = executable script in docs origin.
- [MEDIUM] [backend/src/main.ts:53] - `crossOriginEmbedderPolicy: false` disables COEP; reduces browser isolation guarantees and weakens defense-in-depth for any UI served by this process.
- [MEDIUM] [backend/src/main.ts:59] - `cookieParser()` used without a signing secret; worst-case: code later assumes signed cookies exist (tampering not detected).
- [HIGH] [backend/src/main.ts:80] - `enableImplicitConversion: true` in global `ValidationPipe`; worst-case: coercion-based validation bypass (e.g., `"0"`, `"false"`, `" "` edge cases) causing authorization/logic mistakes.
- [MEDIUM] [backend/src/main.ts:75] - Global `ValidationPipe` uses `transform: true`; worst-case: unexpected DTO mutation and implicit casting across the entire API surface (security-critical when DTOs include role/tenant context fields).
- [MEDIUM] [backend/src/main.ts:101] - `credentials: true` enabled for CORS; if `CORS_ORIGINS` misconfigured to include attacker-controlled origin, browser credentialed requests become possible.
- [HIGH] [backend/src/main.ts:105] - Non-prod fallback origins hardcoded to localhost list; worst-case: "staging" environment not setting `NODE_ENV=production` silently runs with incorrect CORS policy (operational/security misconfiguration hazard).
- [MEDIUM] [backend/src/main.ts:81] - `enableImplicitConversion` combined with `whitelist: true` can create a false sense of safety; coercion happens before business logic, not a substitute for semantic validation (e.g., date ranges, money bounds).
- [MEDIUM] [backend/src/main.ts:81] - Global implicit conversion expands the attack surface of DTO validators relying on strict types (string-to-number coercion edge cases).
- [HIGH] [backend/src/main.ts:181] - Swagger enabled whenever `ENABLE_SWAGGER === 'true'` even in production; worst-case: accidental exposure of internal endpoints, DTO shapes, auth schemes, and operational hints.
- [LOW] [backend/src/main.ts:190] - Logs bind URLs as `http://localhost:${port}`; in deployed environments this is misleading and causes operators to copy-paste invalid endpoints (availability/ops defect).

### Instrumentation (`backend/src/instrument.ts`)

- [HIGH] [backend/src/instrument.ts:4] - `import 'dotenv/config'` loads local env files at runtime; worst-case: production containers accidentally mount `.env` and override secure injected secrets.
- [MEDIUM] [backend/src/instrument.ts:8] - Logging via `process.stdout.write` with interpolated strings; worst-case: log injection / unstructured logs (harder to sanitize and audit).
- [LOW] [backend/src/instrument.ts:6] - Custom `SentryLogger` duplicates logging responsibility rather than using the app logger; observability split-brain.

### Root Module / Global Guards (`backend/src/app.module.ts`)

- [CRITICAL] [backend/src/app.module.ts:63] - `vaultLoader` is an `async` function used inside `ConfigModule.forRoot({ load: [...] })`; worst-case: Nest config loader treats it as a sync factory -> config values become Promises or load order breaks -> secrets missing at runtime.
- [HIGH] [backend/src/app.module.ts:79] - Comment claims "Global: 60 requests per minute" but configured limits are `100/min` plus other buckets; documentation drift causes incorrect operational expectations.
- [HIGH] [backend/src/app.module.ts:80] - `ThrottlerModule.forRoot(...)` configured but there is no visible `ThrottlerGuard` registered as `APP_GUARD` here; worst-case: throttling is effectively inert, creating a phantom security control.
- [HIGH] [backend/src/app.module.ts:208] - Global rate limiting can be disabled via `DISABLE_RATE_LIMITING === 'true'`; worst-case: env misconfig or compromised deploy pipeline disables a critical DoS control.
- [MEDIUM] [backend/src/app.module.ts:205] - Rate limiting is implemented via a custom `IpRateLimitGuard` while Throttler is configured in parallel; dual systems increase complexity and risk of inconsistent bypasses.
- [MEDIUM] [backend/src/app.module.ts:125] - `autoLoadEntities: true` encourages implicit coupling across modules; worst-case: unintended entity registration, migration drift, test/prod mismatch.
- [HIGH] [backend/src/app.module.ts:126] - `synchronize` is configurable via env and not blocked here; worst-case: schema auto-sync enabled in production -> destructive/irreversible data loss risk.
- [MEDIUM] [backend/src/app.module.ts:129] - `maxQueryExecutionTime: 100` is hard-coded; can generate high-volume logs under load and become a self-inflicted DoS in noisy environments.
- [MEDIUM] [backend/src/app.module.ts:130] - `extra` TypeORM options are taken as arbitrary `Record<string, unknown>`; worst-case: unsafe/unvalidated driver knobs (timeouts/pool sizing) cause instability or resource exhaustion.

### Auth Config (`backend/src/config/auth.config.ts`)

- [HIGH] [backend/src/config/auth.config.ts:4] - `jwtSecret: process.env.JWT_SECRET` allows `undefined` in non-prod; worst-case: JWT signing/verification misconfigured, runtime errors, or fallback behavior elsewhere.
- [MEDIUM] [backend/src/config/auth.config.ts:5] - `parseInt(...)` without explicit bounds validation; worst-case: extreme token TTLs if env mis-set (security policy violation).
- [MEDIUM] [backend/src/config/auth.config.ts:6] - `jwtRefreshExpiresDays` lacks upper bounds; worst-case: effectively non-expiring refresh tokens via config error.

### Database Config (`backend/src/config/database.config.ts`)

- [HIGH] [backend/src/config/database.config.ts:21] - `synchronize: process.env.DB_SYNCHRONIZE === 'true'` is allowed in all environments; worst-case: production schema drift/data loss.
- [MEDIUM] [backend/src/config/database.config.ts:23] - Query logging enabled whenever `NODE_ENV === 'development'`; if `NODE_ENV` is mis-set in prod (common), SQL logging may expose sensitive data in logs.
- [MEDIUM] [backend/src/config/database.config.ts:25] - `DB_POOL_SIZE` parsed without min/max; worst-case: huge pool -> DB overload / connection storms.
- [MEDIUM] [backend/src/config/database.config.ts:28] - `statement_timeout` is configurable but not bounded; worst-case: too high -> runaway queries; too low -> systemic failures.
- [MEDIUM] [backend/src/config/database.config.ts:37] - DB connection fields accept `undefined`; runtime failure deferred until first DB operation (poor fail-fast behavior).
- [LOW] [backend/src/config/database.config.ts:15] - Comment asserts pool size was increased "from 50 to 150"; hard-coded claims in code rot quickly.

### Env Validation (`backend/src/config/env-validation.ts`)

- [HIGH] [backend/src/config/env-validation.ts:89] - `DB_HOST` and core DB vars are marked `@IsOptional()`; in production this permits missing DB configuration without validation failure -> non-deterministic startup.
- [HIGH] [backend/src/config/env-validation.ts:97] - `DB_USERNAME` optional; same fail-late behavior.
- [HIGH] [backend/src/config/env-validation.ts:101] - `DB_PASSWORD` optional; same fail-late behavior.
- [HIGH] [backend/src/config/env-validation.ts:105] - `DB_DATABASE` optional; same fail-late behavior.
- [MEDIUM] [backend/src/config/env-validation.ts:119] - JWT secret policy mismatch: comment implies 256-bit/43-char requirement while validator enforces `MinLength(32)`; developers may ship weaker secrets believing they're compliant.
- [MEDIUM] [backend/src/config/env-validation.ts:120] - JWT regex only enforces "letters + numbers"; base64 secrets can be strong but may fail pattern rules; conversely weak alphanumeric strings can pass length + regex.
- [MEDIUM] [backend/src/config/env-validation.ts:262] - `skipMissingProperties: !isProd` means non-prod can run with missing operational parameters (mail/redis/etc.) until runtime code paths explode.
- [MEDIUM] [backend/src/config/env-validation.ts:269] - Only `JWT_SECRET`/`CURSOR_SECRET` errors are suppressed in `NODE_ENV==='test'`; other required-for-tests settings may still silently break tests or cause flaky behavior.
- [LOW] [backend/src/config/env-validation.ts:83] - Defaulting `NODE_ENV` to development in validation class can mask missing env injection (misconfiguration hidden rather than surfaced).

### Vault Loader (`backend/src/config/vault.loader.ts`)

- [HIGH] [backend/src/config/vault.loader.ts:111] - Vault endpoint pulled from `process.env.VAULT_ADDR` without validation; `VAULT_ENABLED=true` with missing addr creates non-obvious failure modes.
- [HIGH] [backend/src/config/vault.loader.ts:112] - Vault token optional; `VAULT_ENABLED=true` with missing token and missing AppRole leads to runtime read failures and silent `{}` return in non-prod.
- [HIGH] [backend/src/config/vault.loader.ts:41] - Logs are written directly to stdout/stderr; without centralized sanitizer, risk of leaking sensitive operational metadata (paths, key names, infra hints).
- [MEDIUM] [backend/src/config/vault.loader.ts:141] - KV v1/v2 handling casts `kvStore.data` to `Record<string, string>` without validating value types; non-string values propagate into env.
- [HIGH] [backend/src/config/vault.loader.ts:153] - Only checks `value !== undefined`, not that `value` is a string; non-string assignments to `process.env` violate Node expectations and can corrupt config consumers.
- [MEDIUM] [backend/src/config/vault.loader.ts:160] - `Object.assign(process.env, filteredSecrets)` mutates global process state; if called multiple times (tests, workers), it is order-dependent and non-idempotent.
- [MEDIUM] [backend/src/config/vault.loader.ts:157] - Warns on non-whitelisted keys but still leaks the key name in logs; worst-case: reveals secret taxonomy to attackers with log access.

### Exception Handling (`backend/src/common/filters/all-exceptions.filter.ts`)

- [HIGH] [backend/src/common/filters/all-exceptions.filter.ts:61] - Logs `stack` for unhandled errors; worst-case: stack contains secrets from thrown errors (tokens, SQL, credentials) and becomes persistent log leakage.
- [MEDIUM] [backend/src/common/filters/all-exceptions.filter.ts:29] - Correlation ID sourced from header `x-correlation-id` without strict validation; worst-case: log injection / trace poisoning.
- [MEDIUM] [backend/src/common/filters/all-exceptions.filter.ts:97] - Correlation ID generation uses `Math.random()`; not collision-resistant under load, not suitable if correlation ID is ever used as a security token (worst-case assumption).
- [LOW] [backend/src/common/filters/all-exceptions.filter.ts:47] - `void responseObj.error; void exception.name;` is a lint-suppression artifact; reduces clarity and indicates tooling fights rather than clean design.
- [MEDIUM] [backend/src/common/filters/all-exceptions.filter.ts:55] - In non-production returns raw `exception.message` to clients; worst-case: developers run "staging" with `NODE_ENV!=production` and leak internals to real users.
- [LOW] [backend/src/common/filters/all-exceptions.filter.ts:87] - Correlation ID is not returned as an HTTP header (only in body); weakens traceability for non-JSON clients and proxies.

### CSRF Middleware (`backend/src/common/middleware/csrf.middleware.ts`)

- [HIGH] [backend/src/common/middleware/csrf.middleware.ts:35] - In non-production, falls back to hard-coded `effectiveSecret` (`'csrf-secret-change-in-production'`) when `CSRF_SECRET` is missing; worst-case: dev/staging run with a known CSRF secret, breaking the "secret" premise and enabling token prediction across environments.
- [MEDIUM] [backend/src/common/middleware/csrf.middleware.ts:19] - Excluded paths include operational endpoints (`/api/v1/metrics`, `/api/v1/health`); if any of these endpoints later gain state-changing behavior, CSRF protection is silently bypassed.
- [MEDIUM] [backend/src/common/middleware/csrf.middleware.ts:39] - CSRF session identifier uses `TenantContextService.getTenantId()` (ambient static context) and cookies (`session_id`) before falling back to hashed `ip:ua`; worst-case: identifier instability / collisions cause intermittent CSRF validation failures and difficult-to-debug client behavior.
- [MEDIUM] [backend/src/common/middleware/csrf.middleware.ts:49] - Uses `req.ip` for identifier fallback without demonstrating `trust proxy` correctness; behind proxies this can become a shared IP and collapse many users into one CSRF session identifier.
- [LOW] [backend/src/common/middleware/csrf.middleware.ts:53] - Uses a cookie named `_csrf` without hardened cookie prefixes (`__Host-` / `__Secure-`); reduces defense-in-depth against cookie injection/overwrite (MDN guidance).
- [MEDIUM] [backend/src/common/middleware/csrf.middleware.ts:55] - CSRF cookie is `SameSite: 'strict'`; this frequently breaks legitimate cross-site flows (third-party redirects, some embed contexts). Strict may be acceptable, but it is a product/ops risk if the system expects cross-site usage.
- [MEDIUM] [backend/src/common/middleware/csrf.middleware.ts:86] - Sets `XSRF-TOKEN` cookie with `httpOnly: false`; XSS can trivially read it. CSRF tokens are not intended to be confidential, but this increases the value of any XSS (MDN/OWASP treat it as defense-in-depth, not a substitute).

### Tenant Resolution Middleware (`backend/src/modules/tenants/middleware/tenant.middleware.ts`)

- [HIGH] [backend/src/modules/tenants/middleware/tenant.middleware.ts:53] - If `TENANT_ALLOWED_DOMAINS` is unset/empty, `isAllowedHost()` returns true (allow-all). In production, this makes Host-header based tenant resolution broadly permissive.
- [HIGH] [backend/src/modules/tenants/middleware/tenant.middleware.ts:59] - Tenant resolution trusts `req.hostname` and uses subdomain parsing to select tenant; worst-case: Host header injection or misconfigured proxy can cause tenant context confusion (tenant isolation boundary risk).
- [MEDIUM] [backend/src/modules/tenants/middleware/tenant.middleware.ts:82] - Logs tenant resolution failures with `logger.debug(..., error)`; error objects can include stack traces and operational detail (guardrail depends on logger config).
- [MEDIUM] [backend/src/modules/tenants/middleware/tenant.middleware.ts:111] - JWT algorithm selection/keys are read from `process.env` (`JWT_ALLOWED_ALGORITHMS`, `JWT_PUBLIC_KEY`) while the HS secret is read from `ConfigService`. Split configuration planes increase drift risk (Vault injection vs env).
- [LOW] [backend/src/modules/tenants/middleware/tenant.middleware.ts:109] - Comment indicates `verify()` "usually" checks expiration by default. Depending on library config, assumptions here can rot; better to be explicit at call sites.

### Rate Limiting Guard (`backend/src/common/guards/ip-rate-limit.guard.ts`)

- [HIGH] [backend/src/common/guards/ip-rate-limit.guard.ts:64] - Rate limiting can be bypassed when `RATE_LIMIT_ENABLED === 'false'` and `NODE_ENV !== 'production'`; if prod is misconfigured as non-prod (common), the control becomes inert.
- [MEDIUM] [backend/src/common/guards/ip-rate-limit.guard.ts:40] - Config reads use `ConfigService.get<number>(...)` with `||` fallback; if env parsing yields `0`, it is treated as falsy and replaced with defaults (surprising, can defeat deliberate settings).
- [MEDIUM] [backend/src/common/guards/ip-rate-limit.guard.ts:103] - Different effective limits for anonymous vs authenticated are based on `request.user` truthiness; any auth integration bug that fails to attach `user` will silently halve limits (availability/behavior drift).
- [MEDIUM] [backend/src/common/guards/ip-rate-limit.guard.ts:147] - `TRUST_PROXY` toggles trusting `X-Forwarded-For`/`X-Real-IP`; if enabled incorrectly, attacker-controlled headers can spoof IP and evade or target-block other users.

### Auth Module (`backend/src/modules/auth/**`)

- [HIGH] [backend/src/modules/auth/auth.controller.ts:107] - `POST /auth/refresh` is marked `@SkipTenant()` yet issues tenant-scoped JWTs; this relies on downstream logic to infer tenant correctly. Any missing tenant context becomes a correctness/security hazard.
- [HIGH] [backend/src/modules/auth/dto/auth.dto.ts:62] - Refresh tokens are returned in JSON response bodies (`TokensDto.refreshToken`); worst-case: token ends up in logs, analytics, browser storage, or referrer leaks. Industry best practice strongly prefers httpOnly cookies for browser clients (OWASP/MDN defense-in-depth).
- [HIGH] [backend/src/modules/auth/services/token.service.ts:58] - Refresh token storage is done via injected repository with no transaction manager parameter; when called from a transaction (e.g., refresh flow), it likely escapes the enclosing transaction, creating split-brain persistence semantics.
- [MEDIUM] [backend/src/modules/auth/services/token.service.ts:84] - `rememberMe` extends refresh token to 30 days without an explicit rotation family limit; risk: long-lived token exposure window.
- [MEDIUM] [backend/src/modules/auth/services/token.service.ts:95] - Persists user-agent (500 chars) and IP address on refresh tokens; operationally useful, but PII-ish and often regulated. Ensure retention/deletion policies exist.
- [HIGH] [backend/src/modules/auth/auth.service.ts:224] - Refresh flow uses pessimistic write lock on stored token (`lock: { mode: 'pessimistic_write' }`); if new refresh token creation is not in the same transaction context (see `TokenService.storeRefreshToken`), it can lead to deadlocks or inconsistent state under concurrency.
- [MEDIUM] [backend/src/modules/auth/auth.service.ts:237] - Logs “Possible token reuse detected” including `userId`, `tokenId`, `ipAddress`, `userAgent`. Valuable, but should be treated as security telemetry; ensure log sinks are access-controlled.
- [LOW] [backend/src/modules/auth/services/token-blacklist.service.ts:20] - Uses per-call TTL (ms) and also configures store-level `ttl` (also ms) in `backend/src/common/cache/cache.module.ts`; store-level `ttl` unit expectations depend on `cache-manager-redis-yet` behavior and should be verified against upstream docs to avoid silent TTL drift.
- [MEDIUM] [backend/src/modules/auth/strategies/jwt.strategy.ts:55] - On blacklisted token, strategy returns `null`. This relies on downstream guards to treat null as unauthorized consistently; any custom guard that trusts `validate()` return values without strict checks becomes risky.
- [MEDIUM] [backend/src/modules/auth/guards/ws-jwt.guard.ts:84] - WebSocket auth allows passing token via querystring (`handshake.query.token`); worst-case: tokens get logged in proxies/CDNs/access logs and leak via referrer-equivalent logging.
- [LOW] [backend/src/modules/auth/auth.service.ts:54] - Uses `bcrypt.hashSync` at startup for dummy timing hash; one-time cost is fine, but synchronous crypto in startup paths increases cold-start latency.

### Client Portal Auth (`backend/src/modules/client-portal/**`)

- [HIGH] [backend/src/modules/client-portal/client-portal.controller.ts:20] - `@SkipTenant()` disables tenant guard but client portal services depend on tenant context being set by middleware; when tenant resolution fails (hostname/proxy issues), downstream calls can throw `BadRequestException('Tenant context missing')` (400) instead of a clean auth/tenant error.
- [MEDIUM] [backend/src/modules/client-portal/client-portal.controller.ts:29] - Magic link endpoints are unguarded (expected), but tenant context still gates correctness. Operationally brittle: a public endpoint’s behavior depends on accurate Host/subdomain handling.
- [MEDIUM] [backend/src/common/services/tenant-context.service.ts:19] - Tenant context missing maps to `BadRequestException` (400). Combined with `TenantGuard` producing 401 for the same missing-tenant condition, client-facing behavior is inconsistent.

### Platform Bypass & MFA (`backend/src/modules/platform/**`)

- [HIGH] [backend/src/modules/platform/decorators/allow-tenant-bypass.decorator.ts:3] - `AllowTenantBypass` metadata exists but there is no consumer (guard/interceptor/repository) reading `ALLOW_TENANT_BYPASS_KEY`; it is a dead control-plane knob.
- [HIGH] [backend/src/modules/platform/README.md:211] - Documentation claims `@AllowTenantBypass()` is required for cross-tenant platform queries, but the codebase uses `@SkipTenant()` and tenant-aware repositories instead. This is drift between security documentation and actual enforcement.
- [CRITICAL] [backend/src/modules/platform/controllers/mfa.controller.ts:36] - `MFAController` uses `@UseGuards(PlatformContextGuard)` but not `PlatformJwtAuthGuard`; any request that can populate `req.user` (or exploit default behavior) may reach MFA endpoints without authenticated platform JWT enforcement.
- [CRITICAL] [backend/src/modules/platform/controllers/mfa.controller.ts:171] - MFA disable endpoint contains `// TODO: Add password verification` and proceeds to disable MFA without validating password; this collapses a key account-security control.
- [HIGH] [backend/src/modules/platform/controllers/mfa.controller.ts:20] - DTOs lack validation decorators and endpoints throw raw `Error(...)` for invalid states. Depending on global exception mapping, this can yield 500s for user-caused errors.
- [HIGH] [backend/src/modules/platform/controllers/platform-auth.controller.ts:56] - Logs platform login attempts including user email (`Platform login attempt for email: ...`); this is PII in logs and can leak sensitive account enumeration signals.

### Tenant Isolation Enforcement Model (Cross-Cutting)

- [MEDIUM] [backend/src/modules/tenants/guards/tenant.guard.ts:29] - Missing tenant context is a 401 (`tenants.tenant_id_required`) at guard level, but a 400 (`Tenant context missing`) in tenant-aware repositories via `TenantContextService.getTenantIdOrThrow()`. Same underlying problem, different status codes.
- [MEDIUM] [backend/src/modules/auth/auth.controller.ts:58] - `@SkipTenant()` used on multiple auth endpoints; these endpoints must be treated as public surface area and must be individually audited for throttling, error messaging, and tenant resolution assumptions.

---

## Section 3: Deep Architectural Review

- The backend is a NestJS monolith with many feature modules (auth, billing, tenants, platform admin, etc.) and a `common/` layer for guards/interceptors/middleware. This is structurally sane for early scale.
- There is an explicit attempt at hardening (Helmet, CSRF middleware, validation pipe, rate limiting guard, env validation, Vault support). The intent is strong.
- The system exhibits control-plane ambiguity: both `@nestjs/throttler` and a custom `IpRateLimitGuard` are present. Without a single authoritative policy point, bypasses and drift are statistically inevitable.
- Configuration/secrets have high fragility:
  - `vaultLoader` being async in config load is a potential "it works locally / fails in prod" class of defect.
  - Production validation enforces JWT secrets, but DB credentials are optional -> critical configs fail late.
- Observability is scattered:
  - `instrument.ts` loads dotenv + Sentry at import-time, while tracing is initialized in `main.ts`; lifecycle and error-handling boundaries are unclear.

---

## Section 4: Refactoring & Remediation

Deferred. Per protocol ("Full Defect Report first"), no code fixes are provided until the defect ledger is complete across `backend/src/**`.

Next tranche to scan: `backend/src/modules/auth/**`, `backend/src/common/guards/**`, `backend/src/common/middleware/csrf.middleware.ts`, and `backend/src/modules/tenants/middleware/tenant.middleware.ts`.

---

## Section 5: External References (Justification)

- OWASP WSTG - Cookie attributes (`Secure`, `HttpOnly`, `SameSite`, `Domain`, `Path`): https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/06-Session_Management_Testing/02-Testing_for_Cookies_Attributes
- OWASP CSRF Prevention Cheat Sheet (double-submit cookie guidance, signed tokens): https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- NestJS CSRF guidance (Express + `csrf-csrf`): https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/security/csrf.md
- `csrf-csrf` docs (double-submit pattern + do not read token from cookie):
  - https://github.com/Psifi-Solutions/csrf-csrf/blob/main/README.md#getting-started
  - https://github.com/Psifi-Solutions/csrf-csrf/blob/main/FAQ.md#why-is-using-the-cookie-in-gettokenfromrequest-a-bad-idea
- MDN Set-Cookie + SameSite (`SameSite=None` requires `Secure`, and SameSite is defense-in-depth):
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
  - https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF
- NestJS cache-manager TTL semantics (ttl in ms): https://docs.nestjs.com/techniques/caching
- OAuth 2.0 Security Best Current Practice (refresh token rotation / replay protection):
  - RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
  - Refresh token protection: https://www.rfc-editor.org/rfc/rfc9700#section-4.14
- Auth0 refresh token rotation & reuse detection:
  - https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
  - https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation
