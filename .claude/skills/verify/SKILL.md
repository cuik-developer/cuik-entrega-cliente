---
name: verify
description: Recipe to stand up Cuik locally (Windows, no Docker) and drive the campaign cron / send routes for runtime verification. Learned the hard way — read the gotchas first.
---

# Verifying Cuik locally (Windows, no Docker)

Nothing in this repo boots from scratch out of the box. This is the path that worked.

## 1. Throwaway Postgres (do NOT use the user's PG on :5432 — needs their password)

Native PG 18 ships `initdb` at `C:\Program Files\PostgreSQL\18\bin`. Spin an isolated cluster on **:5433** with `trust` auth in the session scratchpad:

```bash
PGBIN="/c/Program Files/PostgreSQL/18/bin"
"$PGBIN/initdb.exe" -D "$SCRATCH/pgdata" -U cuik --auth=trust -E UTF8 --no-locale
"$PGBIN/pg_ctl.exe" -D "$SCRATCH/pgdata" -o "-p 5433 -c listen_addresses=localhost" -l "$SCRATCH/pg.log" -w start
"$PGBIN/createdb.exe" -h localhost -p 5433 -U cuik cuik_verify
```

**Gotcha:** `pg_ctl -w start` hangs forever under Git Bash (MSYS pipe inheritance) even though the server is up. Run it with `run_in_background` or a short timeout, then confirm with `netstat -ano | grep 5433` + `tail pg.log` ("ready to accept connections").

Stop: `pg_ctl -D "$SCRATCH/pgdata" -m fast -w stop`.

## 2. Schema — neither `db:migrate` nor `db:push` works on an empty DB

- `db:migrate`: journal lists 7 of 18 SQL files; `0000_create_schemas.sql` is un-journaled; `0000_purple_puck.sql` creates `auth.user` but the code defines Better Auth tables in `public`. Fails.
- `db:push`: drizzle-kit `schemaFilter` defaults to `["public"]` and the repo config doesn't set it → silently creates 12 of 36 tables.

Working path: pre-create the PG schemas, then push with a **scratchpad-only** config that sets `schemaFilter` (never edit `packages/db/drizzle.config.ts` for this):

```bash
psql -h localhost -p 5433 -U cuik -d cuik_verify -c "CREATE SCHEMA IF NOT EXISTS loyalty; CREATE SCHEMA IF NOT EXISTS passes; CREATE SCHEMA IF NOT EXISTS campaigns; CREATE SCHEMA IF NOT EXISTS analytics; CREATE SCHEMA IF NOT EXISTS office;"
cat > "$SCRATCH/drizzle.verify.config.js" <<EOF
module.exports = { dialect: "postgresql", schema: "<abs-repo>/packages/db/schema/*.ts", out: "$SCRATCH/drizzle-out",
  dbCredentials: { url: process.env.DATABASE_URL },
  schemaFilter: ["public","loyalty","passes","analytics","campaigns","office"] };
EOF
cd packages/db && DATABASE_URL=postgresql://cuik@localhost:5433/cuik_verify corepack pnpm exec drizzle-kit push --force --config "$SCRATCH/drizzle.verify.config.js"
```

Expect 36 tables across 6 schemas. A trailing `dependency.c` notice from PG is non-fatal.

## 3. App — env inline, never a `.env` file (CLAUDE.md forbids creating them)

`pnpm` is not on PATH; use `corepack pnpm`. Deps: `corepack pnpm install --frozen-lockfile` (background, ~2-3 min).

```bash
cd apps/web && DATABASE_URL=postgresql://cuik@localhost:5433/cuik_verify CRON_SECRET=verify-cron-secret-0000 \
  BETTER_AUTH_SECRET=<64hex> BETTER_AUTH_URL=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  TRUSTED_ORIGINS=http://localhost:3000 ENCRYPTION_KEY=<64hex> NODE_ENV=development \
  corepack pnpm exec next dev -p 3000 > "$SCRATCH/next-dev.log" 2>&1   # run_in_background
```

Ready in ~20s. Warning about a duplicate `pnpm-lock.yaml` in the parent checkout is harmless (worktree artifact).

## 4. Seed

`curl http://localhost:3000/api/seed` (~40s). Creates tenants `mascota-veloz` (active) and `cafe-central` (trial), 5 users, 6 clients, 2 promos, **0 campaigns**. All seeded users use password `password123`.

## 5. Flows worth driving

**Cron:** `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/campaigns-scheduled` — picks `status='scheduled' AND scheduled_at <= now()`. Auth check runs before any DB work, so 401/405 probes need no seed.

**Force the `executeCampaign` catch block** (no APNs/Google needed): insert a campaign + a `campaign_segments.filter` of `{"tagIds":["not-a-uuid"]}`. `resolveSegment` casts `::uuid` → throws *after* status is set to `sending`. Observe status afterwards. Run the cron twice to prove retry.

**Admin routes** (e.g. `POST /api/<slug>/campaigns/<id>/send`): sign in first and reuse the cookie jar —
`curl -c jar -X POST -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"email":"admin@mascotaveloz.com","password":"password123"}' http://localhost:3000/api/auth/sign-in/email`, then `curl -b jar -X POST -H "Origin: http://localhost:3000" ...`.

**psql gotcha:** `psql -tAc "insert ... returning id"` also prints the `INSERT 0 1` tag. Wrap in a CTE: `with i as (insert ... returning id) select id from i`.

## 6. More gotchas (learned driving the Excel import feature)

- **curl `-F "file=@/c/path.xlsx;type=..."` silently breaks under Git Bash** → `HTTP 000 in 0.000s`. MSYS treats the `;` as a Windows path-list separator and mangles the argument. Drop the `;type=` hint (or set `MSYS_NO_PATHCONV=1`).
- **Biome hangs (no output, >120 s) when given several `apps/web` files at once**, but each file alone checks in 2–4 s. Loop per file with `timeout 30`. Not caused by `.next/` (verified).
- **Biome "format" errors on untouched files are CRLF**: `core.autocrlf=true` checks out CRLF; git normalises to LF on commit, CI never sees it. Compare against an untouched file before acting.
- **Browser file inputs can't take `.value`**, but `input.files = dataTransfer.files` + `dispatchEvent(new Event("change", {bubbles:true}))` works via `javascript_tool` — same trick Playwright uses. Embed the fixture as base64.
- **Radix `<Select>`: `End`/`Enter` don't select; typeahead does** — with the trigger focused, type the option's first letter, then `Return`.
- **Drizzle `sql\`${jsArray}\`` expands to a `($1, $2, …)` tuple, not a PG array.** `= ANY(${arr}::uuid[])` fails at runtime with tests and tsc green. Bind a `{a,b,c}` literal string instead. Only runtime verification caught this.
