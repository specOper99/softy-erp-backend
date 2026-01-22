# Product Engineering Strategy

## 1. Feature Flagging Strategy
**Goal**: Decouple deployment from release.

### Tooling
- **Unleash** (Self-hosted or Cloud).

### Flag Types
| Type | Longevity | Purpose | Default |
|------|-----------|---------|---------|
| **Release Toggle** | Short-lived (Days) | Enable new features safely for % of users. | `false` |
| **Ops Toggle** | Long-lived | Kill switch for heavy features (e.g., "DetailedReporting"). | `true` |
| **Permission Toggle** | Permanent | Enable features for 'Premium' tenants. | `false` |

### Cleanup Policy
- **Stale Flags**: Release toggles MUST be removed from code 2 weeks after 100% rollout. CI should warn on stale flags.

## 2. Product and Engineering KPIs

### Engineering Health
- **MTTR (Mean Time To Recovery)**: Target < 1h.
- **Change Failure Rate**: Target < 5%.
- **Deployment Frequency**: Target > 1/day.

### Product Quality
- **Bug Rate**: < 1 Critical Bug / Sprint.
- **Uptime**: > 99.9% (Matching SLO).
