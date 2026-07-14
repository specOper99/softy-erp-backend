# Backend Module Boundaries

**Owner:** Backend Engineering  
**Status:** Living — report-only gates active  
**Last verified:** 2026-07-10

## Target shape (per module)

```
modules/<name>/
  api/              # Controllers, DTOs, HTTP adapters
  application/      # Use cases, ports
  domain/           # Policies, domain events (no NestJS/TypeORM imports)
  infrastructure/   # TypeORM repos, queue adapters
```

## Dependency rules

- `api → application → domain`
- `infrastructure → application | domain`
- Domain MUST NOT import NestJS, TypeORM, or other feature modules
- Cross-module: exported application ports or durable outbox events only

## Enforcement

| Gate | Mode | Command |
|------|------|---------|
| Layering contract | Blocking | `npm run check:layering-contract` |
| Module folder boundaries | Report-only → blocking | `npm run check:module-boundaries` |
| Circular deps | Blocking | `npm run lint:circular` |

## Migration order

1. `audit` (moderate)
2. `tasks` ✅ · `clients` ✅ · `notifications` ✅ physical folders landed 2026-07-10
3. `finance`, `bookings` (last)

## Tasks status

Physical layout complete under `modules/tasks/{api,application,domain,infrastructure}`.
Known purity gaps (acceptable for this pass): TypeORM decorators on domain entities; application services still import API DTOs; domain helpers import NestJS/`EntityManager`.

## Tenant allowlist removal

Remove entries from `scripts/ci/check-tenant-contract.ts` one domain at a time after cross-tenant tests pass.
