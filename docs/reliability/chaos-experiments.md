# Chaos Experiment: Database Failure

## Experiment Metadata
- **Name**: "Severed Connection"
- **Component**: PostgreSQL Database
- **Hypothesis**: "If the database becomes unavailable, the API should return 503 Service Unavailable for writes, but health probes should fail immediately to trigger restart/failover."

## Scenario
1. **Steady State**: System running, `GET /health` returns 200 OK.
2. **Action**: Stop PostgreSQL Container.
   ```bash
   docker stop chapters-studio-erp-postgres-1
   ```
3. **Observation**:
   - `GET /health` should return 503 within 5 seconds (Terminus check).
   - `POST /api/v1/bookings` should return 503 or 504.
   - Logs should show "ConnectionError" (not unhandled exception crash).
4. **Recovery**: Start PostgreSQL Container.
   ```bash
   docker start chapters-studio-erp-postgres-1
   ```
5. **Verification**: `GET /health` returns 200 OK within 10 seconds.

## Automated Test
Run the simplified local version:
```bash
./scripts/game-day-chaos.sh
```
