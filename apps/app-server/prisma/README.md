# App Server Prisma Anchor

`docs/db/pilo_erd_schema.sql` remains the database contract source of truth for the emergency baseline.

When an implementation branch introduces ORM-backed persistence:

1. Update `docs/db/pilo_erd_schema.sql` and `docs/db/db-schema-by-owner.md` first.
2. Update the owner-local shard in `docs/db/domains/<domain>.tables.sql`.
3. Add the matching owner-local Prisma shard in `apps/app-server/prisma/domains/<domain>.prisma`.
4. Add the bundled Prisma schema change in `apps/app-server/prisma/schema.prisma` only in the contract PR that serializes shard changes.
5. Add migration files under `apps/app-server/prisma/migrations/`.
6. Use `YYYYMMDDHHMM_owner-slug_domain_action` for migration directory names.
7. Do not add tables or foreign keys owned by another domain without a contract PR.
