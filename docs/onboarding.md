# Developer Onboarding Guide

Welcome to the team! This guide will get you set up and contributing in Day 1.

## 1. Prerequisites
- **Node.js**: v20 (Use `nvm use` to auto-select from `.nvmrc`)
- **Docker**: Desktop or Colima (for DB and Redis)
- **AWS CLI**: v2 (if you need S3 access)

## 2. Setup
1. **Clone the repo**:
   ```bash
   git clone git@github.com:softy/erp-backend.git
   cd erp-backend
   ```
2. **Install Dependencies**:
   ```bash
   npm ci
   ```
3. **Environment**:
   ```bash
   cp .env.example .env
   # Ask your lead for the Vault token or specific dev secrets
   ```

## 3. Running Locally
1. **Start Infrastructure**:
   ```bash
   docker-compose up -d postgres redis zipkin
   ```
2. **Migration**:
   ```bash
   npm run migration:run
   ```
3. **Seed Data**:
   ```bash
   npm run seed
   ```
4. **Start App**:
   ```bash
   npm run start:dev
   ```

## 4. Testing
- **Unit**: `npm run test`
- **E2E**: `npm run test:e2e`
- **Mutation**: `npm run test:mutation` (Runs Stryker on auth module)

## 5. Key Reads
- [Architecture Decisions](../docs/adr/)
- [API Utils](../src/common/)
- [Coding Guidelines](../CODEOWNERS)

## 6. Definition of Done (DoD)
- [ ] Code compiles (no lint errors)
- [ ] No `any` types used anywhere (strict policy)
- [ ] Unit tests added/updated (100% coverage for Domain logic)
- [ ] Integration tests added for DB interactions
- [ ] No new Security/Critical vulnerabilities
