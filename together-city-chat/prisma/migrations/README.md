# Migrations

Schema changes are versioned here and applied with `prisma migrate deploy`.

## Why this directory exists

Until it did, `docker-entrypoint.sh` ran `prisma db push` on every boot — and if
Postgres refused a change as destructive, it **retried with `--accept-data-loss`**.
That was added for a real reason (one removed model was blocking every deploy and
breaking login), but the cure was worse than the disease: any change Prisma reads
as column- or table-dropping got force-applied to production, with no review, no
record, and no way back.

With migrations, a destructive change has to be written out as SQL and read by a
human before it ever runs.

## `0_baseline`

The production database already had every table, built up by successive
`db push` runs, but no migration history. `0_baseline` is the schema as it stood
on 2026-07-29, generated with `migrate diff --from-empty`. It is **never executed**
against that database: the entrypoint detects tables-without-history and calls
`migrate resolve --applied 0_baseline`, which records it as done and stops there.

It *does* run in full on a genuinely empty database, which is what makes a fresh
environment reproducible.

Do not edit it. Prisma checksums an applied migration, and a later edit makes
`migrate deploy` fail on every environment that already has it.

## Adding a migration

```sh
npx prisma migrate dev --name what_changed
```

**If that fails with `Error in Schema engine:` and no detail**, the cause is the
empty `datasource` block in `schema.prisma` — Prisma 7 moved the URL into
`prisma.config.ts`, which only defines the datasource when `DATABASE_URL` is set.
Give the command a connection string. For commands that never open a connection
(`migrate diff --from-empty`), any syntactically valid string will do:

```sh
DATABASE_URL="postgresql://u:p@127.0.0.1:5432/db" \
  npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

Note the flag is `--to-schema`; `--to-schema-datamodel` was removed in Prisma 7.

Review the generated SQL before committing. If it contains `DROP`, be certain
that is what you meant — nothing downstream will ask you again.
