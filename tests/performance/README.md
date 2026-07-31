# Performance tests

Run the current smoke profile with:

```bash
k6 run tests/performance/smoke.js
```

The profile is intentionally small. Add separate `load.js`, `stress.js`, and `soak.js` scenarios only
after service-level objectives and production-like capacity assumptions have been agreed.
