# Document two-node scaling evidence

Captured on 2026-08-01 against the local Docker integration stack: PostgreSQL, Redis, App Server, and two independently spawned Realtime Server processes.

## Reproduction

```powershell
cd apps/realtime-server
$env:E2E_ROUNDS='1'
$env:E2E_RESULT_PATH='../../docs/superpowers/evidence/document-two-node-scaling/baseline.json'
npm.cmd run test:document-two-node:e2e -- --mode=baseline
```

Five sessions are split 3:2 across `realtime-a` and `realtime-b`. With Redis document sync disabled, both instances attempted to save `expectedVersion=0`. The App Server returned `200` to one instance and a real `409` to the other. The losing instance merged the latest snapshot and retried at version 1.

Raw result: [baseline.json](baseline.json)

## Verification after the fix

```powershell
cd apps/realtime-server
Remove-Item Env:E2E_ROUNDS -ErrorAction SilentlyContinue
$env:E2E_RESULT_PATH='../../docs/superpowers/evidence/document-two-node-scaling/fixed.json'
npm.cmd run test:document-two-node:e2e -- --mode=fixed
```

The default fixed run executes three rounds of 5 sessions × 300 edits. Both health endpoints reported Redis sync `ready`. Across 4,500 total edits, checkpoint 409 count was 0 and all 4,500 edits were present after persistence and reconnect. The handoff phase held a real snapshot request open, initiated shutdown of the task performing that checkpoint, verified the task remained alive while the request was blocked, released the request, and then verified the two pre-shutdown markers through the surviving task and App Server snapshot.

Raw result: [fixed.json](fixed.json)

The runner writes these JSON files directly from the same sanitized result object printed as `TWO_NODE_E2E_RESULT_JSON`. The HTML report loads these two files at runtime; it does not contain a second manually curated result dataset.

## Scope

This evidence validates the implementation in a deterministic local integration environment. It does not by itself claim production traffic volume, long-duration soak behavior, or AWS failure-zone resilience. Those require a separate dev ECS rollout and observation.
