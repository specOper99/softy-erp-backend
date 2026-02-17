# Tenant Contract

This repo enforces tenant isolation as a _code contract_ (not just a convention). The rules here are the ones that are actually implemented and gated in CI.

## Source Of Tenant Identity

- Source of truth is the verified JWT `tenantId` claim from `Authorization: Bearer <JWT>`.
- Client-provided tenant headers are not used (no `X-Tenant-ID` style override).

Implementation:

- `src/modules/tenants/middleware/tenant.middleware.ts` extracts `tenantId` from the JWT (signature verified) and establishes tenant context.

## Tenant Context Propagation

- Tenant context is stored in `AsyncLocalStorage<string>`.
- The public API is `TenantContextService.run(tenantId, () => ...)` and `TenantContextService.getTenantIdOrThrow()`.

Implementation:

- `src/common/services/tenant-context.service.ts` (AsyncLocalStorage-backed)
- `src/modules/tenants/middleware/tenant.middleware.ts` (per-request `run(...)`)

Contract:

- Any code that needs tenant-scoped persistence must run under tenant context.
- For non-request execution (handlers/processors/crons, platform endpoints targeting a tenant, etc.), you must explicitly wrap work with `TenantContextService.run(targetTenantId, ...)`.

## Persistence Contract (Repositories)

Rule:

- Tenant-scoped entities (entities that have a `tenantId` field) must be accessed via `TenantAwareRepository` (or a subclass like `BookingRepository`, `TaskRepository`, `TransactionRepository`, etc.).
- Raw TypeORM repositories (`@InjectRepository(Entity) private repo: Repository<Entity>`, `dataSource.getRepository(...)`, `manager.getRepository(...)`, etc.) are prohibited inside tenant-scoped modules.

Enforcement:

- `scripts/ci/check-tenant-contract.ts` scans `src/**` and flags:
  - Reading `tenantId` from DTO/body/query in tenant-scoped controllers/services (`TENANT_ID_FROM_REQUEST`).
  - Raw repository injection or `getRepository(...)` bypass (`RAW_REPOSITORY_IN_TENANT_MODULE`).

Known allowlists (explicit and conservative):

- Global modules that are exempt from tenant-scoped repository rules:
  - `src/modules/platform/`
  - `src/modules/tenants/`
  - `src/modules/health/`
  - `src/modules/metrics/`
- Allowlisted global entities/paths (examples): `Tenant`, `OutboxEvent`, and a small set of exact files referenced in `scripts/ci/check-tenant-contract.ts`.

## Query Safety Contract (QueryBuilder)

### Safe Default: Tenant-Aware QueryBuilder

`TenantAwareRepository.createQueryBuilder(alias)` starts with a tenant filter and then applies runtime guards:

- `.where(...)` is _patched_ to behave like `.andWhere(...)` so the initial tenant filter cannot be overwritten.
- `.orWhere(...)` is _blocked at runtime_ and throws an error telling you to use `Brackets`.

Implementation:

- `src/common/repositories/tenant-aware.repository.ts` (see `createQueryBuilder()`)

### Bracketing Requirement

Rule:

- Unbracketed `.orWhere(...)` on tenant-scoped query builders is not allowed. Use:

```ts
.andWhere(new Brackets((qb) => qb.where('...').orWhere('...')))
```

Enforcement:

- `scripts/ci/check-tenant-query-safety.ts` fails on any `.orWhere(` not inside `new Brackets(...)`.

### Coverage Test Guard

- `src/test/security/tenant-query-builder.spec.ts` asserts `createQueryBuilder(...)` usages are followed by tenant scoping signals (or use `TenantAwareRepository`).

## `@SkipTenant()` Contract

`@SkipTenant()` disables the global tenant-context guard for an endpoint.

Implementation:

- Decorator: `src/modules/tenants/decorators/skip-tenant.decorator.ts`
- Guard behavior: `src/modules/tenants/guards/tenant.guard.ts` checks metadata on both handler and controller class.

Allowed categories (as implemented by reporting/classification):

- `tenant-agnostic` (Health/Metrics/Platform/Billing)
- `tenant-specific-unauthenticated` (Client Portal)
- `auth-bootstrap` (Register/Login/Refresh)

Contract:

- If an `@SkipTenant()` endpoint touches tenant-scoped dependencies, it must establish tenant context explicitly via `TenantContextService.run(tenantId, ...)`.
- `scripts/ci/check-tenant-contract.ts` enforces this for a set of known `@SkipTenant()` controllers/methods (method-level contracts).

Reporting:

- `scripts/ci/report-skip-tenant.ts` generates `skip-tenant-report.json` and `skip-tenant-report.md` with endpoint classifications.

## CI Gates

Scripts (see `package.json`):

- `npm run check:tenant-contract` → `scripts/ci/check-tenant-contract.ts`
  - Enforces: tenantId not read from request DTOs, raw repo / getRepository bypass rules, and explicit context for selected `@SkipTenant()` endpoints.
- `npm run check:tenant-query-safety` → `scripts/ci/check-tenant-query-safety.ts`
  - Enforces: no unbracketed `.orWhere(...)` in tenant-scoped query builders.
- `npm run check:tenant-async-boundary` → `scripts/ci/check-tenant-async-boundary.ts`
  - Enforces: handlers/processors/crons that touch tenant-owned persistence must call `TenantContextService.run(tenantId, ...)`.
- `ts-node scripts/ci/report-skip-tenant.ts`
  - Reports: where `@SkipTenant()` exists and how it is classified.
  - Note: this repo currently has no `package.json` script alias for it.

Wiring:

- `npm run validate` includes `check:tenant-contract` and `check:tenant-async-boundary` (and does not include `check:tenant-query-safety` or `report-skip-tenant`).
