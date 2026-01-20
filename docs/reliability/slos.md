# Service Level Objectives (SLOs)

## Definitions
- **SLI (Service Level Indicator)**: The metric we measure (e.g., latency).
- **SLO (Service Level Objective)**: The target reliability (e.g., 99.9%).
- **Error Budget**: The amount of unreliability allowed (100% - SLO).

## 1. Authentication Service
**Criticality**: Tier 1 (Blocker)

| User Journey | SLI Type | Metric | SLO (Target) | Period |
|--------------|----------|--------|--------------|--------|
| **Login** | Availability | `HTTP 200` on `/auth/login` | 99.95% | 30 days |
| **Login** | Latency | p95 duration | < 500ms | 30 days |
| **Token Verify** | Latency | p99 duration | < 50ms | 30 days |

## 2. Booking Service
**Criticality**: Tier 1 (Revenue)

| User Journey | SLI Type | Metric | SLO (Target) | Period |
|--------------|----------|--------|--------------|--------|
| **Create Booking** | Availability | `HTTP 201` on `/bookings` | 99.9% | 30 days |
| **Checkout Flow** | Success Rate | Completed vs Started | 98% | 30 days |

## 3. Worker/Async Jobs
**Criticality**: Tier 2 (Background)

| User Journey | SLI Type | Metric | SLO (Target) | Period |
|--------------|----------|--------|--------------|--------|
| **Email Delivery** | Freshness | Time from event to send | < 1 min | 30 days |
| **Payroll Calc** | Accuracy | No recalc needed | 100% | 30 days |

## Alerting Policy
- **Burn Rate Audit**: Alert if we consume > 2% of Error Budget in 1 hour.
- **Page**: Alert if Availability drops < 99.0% for 5 mins.
