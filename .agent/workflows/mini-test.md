---
description: 
---

After completing each plan I request, follow these steps strictly:

1.  **Static Analysis: Validation:**
    * Check Commit Message (Conventional Commits).
    * Lint (`eslint`).
    * Security Audit (`npm audit`).
    * Run `npm run lint` and fix ALL auto-fixable issues.
2.  **Test Coverage: Test:**
    * Unit Tests (Parallelized).
    * Integration (e2e) Tests (Service + DB Containers).
    * Run `npm run test:cov`. If coverage on new files is <80%, write more tests immediately.