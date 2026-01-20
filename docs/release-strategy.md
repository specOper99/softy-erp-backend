# Release Strategy: Gated Deployments

## 1. Objective
Eliminate "Big Bang" deployments by gradually shifting traffic to new versions.

## 2. Tooling
We adopt **Argo Rollouts** (Kubernetes Controller) for advanced deployment capabilities.

## 3. Canary Release Strategy (Default)
**Suitable for**: Stateless Services (Auth, Booking).

### Steps:
1.  **Stage 1 (Canary)**: Deploy new version to 5% of traffic.
    - Duration: 10 minutes.
    - Automated Analysis: Check `http_error_rate < 1%` and `latency_p99 < 500ms`.
2.  **Stage 2 (Scale)**: Increase traffic to 25%.
    - Duration: 30 minutes.
3.  **Stage 3 (Promotion)**: Full rollout to 100%.

### Rollback Trigger
If Automated Analysis fails (e.g., error rate spikes), Argo Rollouts automatically reverts all traffic to the Stable version immediately.

## 4. Blue/Green Strategy
**Suitable for**: Stateful Services or incompatible schema changes.

### Steps:
1.  **Deploy Green**: Spin up full parallel stack of new version (Green) alongside old (Blue).
2.  **Smoke Test**: Run automated E2E tests against Green environment (private service).
3.  **Cutover**: Switch Load Balancer service to Green.
4.  **Wait**: Keep Blue running for 1 hour for quick fallback.
5.  **Teardown**: Terminate Blue.
