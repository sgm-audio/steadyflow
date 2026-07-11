# Session Log

Plain-text running log of work sessions on SteadyFlow. See `CHANGELOG.md` for the user-facing/technical changelog — this file is a lighter chronological record of what happened per session.

## 2026-07-11 — BYOK unwrap fix, keys delete action, logout crash, LLM prompt bug

**Files changed:**
- `packages/crypto/` — deleted (dead code once the passphrase layer was dropped)
- `supabase/migrations/20260710000001_keys_envelopes_drop_passphrase_layer.sql` — new
- `supabase/migrations/20260105000003_seed_dev.sql` — dev password → `admin`
- `apps/edge/src/workers.ts` — `tryUnwrapKey` simplified, LLM prompt now includes source URL, `proxyLlm` returns `{content, provider, model}`
- `apps/edge/src/handlers.ts`, `supabase/functions/keys-set/index.ts` — matching schema change on the BFF path
- `packages/core/src/contracts/procedures.ts` — `keys.set` input simplified to `{ provider, rawKey }`
- `packages/db/src/database.types.ts` — regenerated types for the simplified schema
- `apps/web/src/app/api/keys/route.ts` — raw key in/out instead of a client-wrapped envelope; added `DELETE`
- `apps/web/src/app/keys/[provider]/page.tsx` — passphrase field removed
- `apps/web/src/app/keys/page.tsx`, `apps/web/src/app/keys/RemoveKeyButton.tsx` — new delete-key UI
- `apps/web/src/app/layout.tsx` — dead Tailwind classes dropped, then reconciled with a concurrent dashboard redesign that added real Tailwind v4
- `apps/web/src/app/logout/page.tsx` → `apps/web/src/app/logout/route.ts` — fixed a 500 crash on every logout
- `apps/web/src/app/dashboard/page.tsx` — one lint fix after merging in the redesign
- `CHANGELOG.md`, `DEPLOYMENT.md`, `scripts/dev.sh` — docs/credentials updated to match

**Decisions:**
- Dropped the client-side passphrase encryption layer for BYOK keys. This is a personal single-user tool, not a zero-knowledge multi-tenant product — the server's pgsodium KEK alone is a reasonable trust boundary, and the passphrase design was architecturally incompatible with an unattended background worker anyway (confirmed by the user before implementing).
- Used three parallel subagents for the independent follow-up fixes (delete-key action, dead Tailwind cleanup, LLM prompt bug), then verified and committed the combined result myself in sequence.
- When the branch diverged from a concurrently-merged dashboard redesign, merged it in rather than force-pushing over it, and let the redesign's real Tailwind classes win over my earlier dead-class removal in `layout.tsx`.

**Outcomes:**
- PR #2 (BYOK unwrap fix) — merged.
- PR #5 (this session's follow-up fixes) — opened as a draft, ready for review.
- Everything verified live against the real local Supabase stack and the actual browser UI, not just unit tests: key add/remove, login with the new password, logout no longer crashing, and a real submit → scrape → analyze → insights run producing a correct (non-"unknown") title.
- `pnpm typecheck && pnpm lint && pnpm test` green throughout (13/13 packages).
