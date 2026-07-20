# Contributing

## Setup (once)

```bash
pnpm setup
# Requires: Node 20+, pnpm 9, Docker Desktop, Supabase CLI
```

## Daily

```bash
pnpm dev      # start local stack
pnpm stop     # end of day
pnpm check    # before opening a PR
```

## Required local secrets (never commit)

Local web + Studio work with defaults from `.env.local.example`.
Fill these only when deploying or pushing to a remote Supabase project:

| Var | Used by |
|---|---|
| `SUPABASE_SECRET_KEY` | Edge Functions, migrations |
| `SUPABASE_DB_PASSWORD` | `supabase db push`, Drizzle |
| `SUPABASE_ACCESS_TOKEN` | `supabase functions deploy` |

## Workflow

1. Branch from `main`: `git checkout -b feat/<scope>`
2. Make changes
3. `pnpm check`
4. Open PR — CI runs the same checks plus contract tests
5. Merge after approval

## Commit style

Conventional Commits:
- `feat:` new feature
- `fix:` bug fix
- `chore:` tooling, deps, config
- `docs:` documentation only
- `refactor:` no behavior change
- `test:` tests only
- `ci:` CI/CD changes

## Security

- Never paste secrets in chat, issues, or PRs
- Never log plaintext provider keys
- All external actions must write to `audit_log`
- All Zod boundaries must reject unknown keys (`z.strictObject` or `.strict()`)
