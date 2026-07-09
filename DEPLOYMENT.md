# SteadyFlow Deployment Guide

## Prerequisites

- Supabase account with a project
- Vercel account (for web dashboard)
- Chrome Web Store developer account (for extension)
- Node.js 20+, pnpm 9+

## 1. Supabase Setup

### 1.1 Create project
```bash
# Set up via supabase.com dashboard or CLI
supabase init
supabase link --project-ref <your-project-ref>
```

### 1.2 Generate the KEK
Run once, in Supabase Dashboard → SQL Editor (see `supabase/scripts/setup-kek.sql`):
```sql
grant pgsodium_keyholder to postgres;
select pgsodium.create_key(key_type => 'aead-ietf', name => 'steadyflow-kek');
```
No secret/env var to copy anywhere — `wrap_dek()`/`unwrap_dek()` (see migration
`20260109000006_dek_pgsodium_wrap.sql`) look the key up by name at call time.

### 1.3 Apply migrations
```bash
supabase db push
```

### 1.4 Deploy Edge Functions
```bash
pnpm install
supabase functions deploy --project-ref <your-project-ref>
```

## 2. Web App (Vercel)

### 2.1 Connect repository
1. Go to vercel.com → New Project
2. Import this repository
3. Set Framework: Next.js
4. Root Directory: `apps/web`

### 2.2 Environment variables
Add to Vercel → Settings → Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### 2.3 Deploy
Vercel auto-deploys on push to `main`.

## 3. Chrome Extension

### 3.1 Build
```bash
cd apps/extension
pnpm build
```

### 3.2 Publish
1. Go to Chrome Web Store Developer Dashboard
2. Upload the `apps/extension/dist/` zip
3. Set the Supabase URL in the extension's manifest (already done)
4. Submit for review

## 4. Local Development

### 4.1 Start services
```bash
# Start local Supabase (requires Docker/podman)
export DOCKER_HOST="unix:///run/user/1000/podman/podman.sock"
supabase start

# Run migrations + seed
supabase db reset

# Start web app
cd apps/web
pnpm dev

# Build extension
cd apps/extension
pnpm build
# Load unpacked from chrome://extensions → apps/extension/dist/
```

### 4.2 Test credentials
```
Email: dev@steadyflow.local
Password: dev-password-not-for-production
Org: Dev Org
```

## 5. Monitoring

- **Errors:** Sentry (configure in Edge Function secrets: `SENTRY_DSN`)
- **Uptime:** Health checks via Checkly or Healthchecks.io pinging `/api/health`
- **Logs:** Supabase Dashboard → Edge Functions → Logs

## 6. Rollback

### Edge Functions
```bash
git checkout <previous-commit>
supabase functions deploy --project-ref <ref>
```

### Database
```bash
supabase db reset  # WARNING: destroys data
# Or create a rollback migration:
supabase migration new rollback_xxx
```

### Web
Vercel auto-deploys Git commits — revert the commit and push to redeploy.
