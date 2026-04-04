# ADR-0008: Authorization Policy Placement and Guardrails

Date: 2026-02-23

## Status

Accepted

## Context

Critical write actions were protected inconsistently across layers. Some task status transitions relied on service checks only, while controller-level role requirements were implicit. This made policy drift harder to detect.

## Decision

- Apply explicit `@Roles(...)` decorators on critical task mutation routes (`start`, `complete`) in the controller layer.
- Keep service-layer authorization checks as defense in depth and as protection against non-controller invocation paths.
- Add a guardrail test that validates role metadata is present and correct on critical endpoints.

## Consequences

- Authorization intent is visible at the API boundary and still enforced in domain/service logic.
- Regression risk is reduced: metadata drift is caught by tests before release.
- Future critical actions should follow the same pattern: explicit controller policy + service validation.
