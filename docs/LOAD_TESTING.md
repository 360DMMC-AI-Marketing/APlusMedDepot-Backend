# Load Testing

## 1. How to Run Load Tests

1. Start the API locally:
   ```bash
   npm run dev
   ```
2. Run the load test:
   ```bash
   npm run test:load
   ```
3. Run with JSON output + HTML report:
   ```bash
   npm run test:load:report
   ```
4. Report output file:
   - `tests/load/report.json`

## 2. What Scenarios Cover

The load profile is defined in `tests/load/config.yml` and includes:

- `Browse products` (40%): baseline catalog reads
- `Search products` (20%): search endpoint reads
- `Full purchase flow` (10%): login + cart add + checkout validation
- `Supplier dashboard` (10%): supplier login + supplier orders
- `Admin dashboard` (10%): admin login + dashboard read
- `Credit check` (10%): customer login + credit endpoint read

Traffic phases:

- Warm up: 30s at 5 req/s
- Sustained load: 60s at 20 req/s
- Peak load: 30s at 50 req/s

## 3. Performance Targets

- p95 < 500ms for read endpoints
- p95 < 1000ms for write endpoints
- 0 errors at 20 req/s sustained load
- < 1% errors at 50 req/s peak load

## 4. How to Interpret Results

- Check request latency percentiles (`p50`, `p95`, `p99`) by scenario.
- Separate read-heavy vs write-heavy scenario behavior when evaluating p95 targets.
- Inspect `codes` and `errors` sections for non-2xx responses and transport failures.
- Validate error-rate targets by phase, not just total run aggregate.
- If thresholds are missed:
  - Identify the slow scenario(s) first.
  - Correlate with server logs/DB metrics for bottlenecks.
  - Re-run after each optimization to confirm improvement.
