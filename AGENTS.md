# Backend AGENTS.md

Nearest-file SOP when editing under `backend/`. Parent: root [`AGENTS.md`](../AGENTS.md).

## Stack

NestJS + TypeORM + Postgres. Tests: Jest unit (`src/**/*.spec.ts`), integration (`test/integration`), e2e (`test/*.e2e-spec.ts`), pact (`test/pact`).

## Verify (required = husky pre-push)

```bash
# Same as git push (mandatory before claiming done):
npm run validate -w backend
# = lint + type-check + contract check:* + unit tests

# Extra for money / lifecycle behavior:
npm run test:integration -w backend -- --testPathPatterns=booking-finance
npm run test:e2e -w backend -- --testPathPatterns=workflows
```

Domain invariants: `docs/DOMAIN_INVARIANT_MATRIX.md`.

## Tenant isolation

Never take `tenantId` from request body, query, or client headers as authority. Use session/context. See `docs/TENANT_CONTRACT.md`. Cursor rule: `.cursor/rules/tenant-isolation.mdc`.

## Migrations

Prefer expand/contract. No destructive drop/alter without policy review. Run `npm run check:migration-policy` (or CI script `scripts/ci/check-migration-policy.ts`). Cursor rule: `.cursor/rules/migrations-safety.mdc`.

## Must NOT

- Cross-module imports that violate `docs/MODULE_BOUNDARIES.md` / layering contracts
- Skip outbox/event publish ordering for booking/finance lifecycle
- Weaken authz or tenant query safety checks to “make green”
