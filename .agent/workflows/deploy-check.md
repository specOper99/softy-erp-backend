---
description: # Workflow: After-Development verification
---

After completing each plan I request, follow these steps strictly:

1.  **Static Analysis: Validation:**
    * Check Commit Message (Conventional Commits).
    * Lint (`eslint`).
    * Security Audit (`npm audit`).
    * Run `npm run lint` and fix ALL auto-fixable issues.
2.  **Test Coverage: Test:**
    * Unit Tests (Parallelized).
    * Integration Tests (Service + DB Containers).
    * Run `npm run test:cov`. If coverage on new files is <80%, write more tests immediately.
3.  **Build & Scan:**
    * Build Docker Image.
    * **Trivy Scan:** Scan image for CVEs (High/Critical severity = Fail Pipeline).
    * **Circular Dependency Check:** Run `npx madge --circular src/`. If cycles exist, refactor immediately.
4.  **Deploy (GitOps):**
    * Update the `values.yaml` in the GitOps repo (ArgoCD pattern).
5.  **Output Report:** Generate a summary markdown table.