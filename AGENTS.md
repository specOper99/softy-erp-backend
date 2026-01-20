# Repository Guidelines

## Project Structure & Module Organization
- `src/` houses the NestJS app. Feature modules live in `src/modules/[feature]/` with `dto/`, `entities/`, `controllers/`, and `services/`.
- Shared concerns (guards, interceptors, decorators, repositories) are under `src/common/`.
- Database code sits in `src/database/` (migrations, seeds, data source).
- Tests are split across `src/**/**/*.spec.ts` (unit), `test/*.e2e-spec.ts` (E2E), and `test/integration/`.
- Infra and deployment assets live in `docker/`, `manifests/`, and `scripts/`.
- Operational docs live in `OPERATIONS.md`; general overview is in `README.md`.

## Build, Test, and Development Commands
- `docker compose up -d`: start Postgres, Redis, MinIO for local development.
- `npm run start:dev`: run the API with hot-reload.
- `npm run start:debug`: run with the Node inspector attached.
- `npm run build` / `npm run start:prod`: build and run the production bundle.
- `npm run lint` / `npm run format` / `npm run type-check`: lint, format, and run the TS type checker.
- `npm run test`, `npm run test:e2e`, `npm run test:integration`: run unit, E2E, and integration suites.
- `npm run test:cov`: run unit tests with coverage.
- `npm run migration:run` / `npm run seed`: apply database migrations or seed data.
- `npm run db:reset:test`: reset the test database during local runs.

## Coding Style & Naming Conventions
- TypeScript only; **STRICT ZERO `any` policy** (production & tests). Use `unknown` with narrowing.
- Naming: classes in `PascalCase`, files in `kebab-case`, DI tokens in `UPPER_SNAKE_CASE`.
- Formatting and linting are enforced via Prettier and ESLint; lint-staged runs on staged `*.ts` files.

## Testing Guidelines
- Jest is the default runner; configs for E2E and integration live in `test/` and `jest.*.config.js`.
- Test files use `.spec.ts` (unit) and `.e2e-spec.ts` (E2E) naming.
- Prefer centralized mocks from `test/helpers/mock-factories.ts` and reset mocks between tests.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`, `docs:`); header max length is 200.
- Keep commits focused and atomic.
- PRs should include a clear description, linked issues when applicable, and test evidence. Run `npm run validate` before requesting review.

## Configuration & Local Setup
- Copy `.env.example` to `.env` and update required values.
- Local services (Postgres/Redis/MinIO) are expected for most dev and test workflows; see `docker-compose.yml`.

## Agent-Specific Instructions
- For GitHub PR review comment handling, use the `gh-address-comments` skill and ensure `gh auth status` succeeds before fetching threads.
- For failing GitHub Actions checks, use the `gh-fix-ci` skill to inspect PR checks, summarize logs, propose a plan, and wait for approval before coding.
