# Prisma Migrations

Place owner-scoped Prisma migrations here when app-server persistence is implemented.

Directory name format:

```text
YYYYMMDDHHMM_owner-slug_domain_action
```

Examples:

- `202606291030_juhyung_task_status_history`
- `202606291045_eunjae_review_graph_nodes`

Every migration that changes public data shape must have a matching contract update in `docs/db/pilo_erd_schema.sql`, `docs/db/db-schema-by-owner.md`, and the relevant `docs/contracts/*.md` file.
