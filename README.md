# PILO

PILO is the 301-2 SW/AI project workspace. All branch work should follow the owner and contract boundaries documented in this repository.

Default reviewers:

- @rlawngud0428
- @jinhokingofworld
- @Developer-EJ
- @Sein0104
- @ndh5178

## Agent Quickstart

1. Work from `emergency-juh` or a branch created from it.
2. Read `agent.md`, then `docs/contracts/README.md`, then your file in `docs/agents/`.
3. Treat `docs/contracts/openapi/pilo-public-api.yaml` and `docs/contracts/schemas/pilo-public-contracts.schema.json` as the public API source of truth.
4. Keep implementation changes inside your owner folders listed in `docs/agent-collaboration-guide.md`.
5. Use `docs/dev-local-setup.md#fresh-agent-commands` for exact working directories and run/test commands.
6. Run the focused guardrails before opening a PR:

```powershell
node --test tests/docs.test.mjs apps/app-server/tests/smoke.test.mjs
```

Local default ports:

| Service | Port |
|---|---:|
| Frontend | 3000 |
| App Server | 4000 |
| Realtime Server | 4001 |
