-- SteadyFlow development seed
-- Migration: 0003_seed_dev
--
-- Creates a test org, test user, and sample data for local development.
-- Only runs in local Supabase (not in production).
--
-- Test credentials:
--   Email: dev@steadyflow.local
--   Password: dev-password-not-for-production
--   Org: Dev Org

-- Create a test user via Supabase Auth.
-- Note: in local dev, auth.users can be inserted directly.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token,
  email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'dev@steadyflow.local',
  crypt('dev-password-not-for-production', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), '',
  '', '', ''
)
on conflict (id) do nothing;

-- Create the dev org.
insert into public.orgs (id, name, default_llm_provider, default_llm_model)
values (
  '22222222-2222-2222-2222-222222222222',
  'Dev Org',
  'deepseek',
  'deepseek-chat'
)
on conflict (id) do nothing;

-- Add the dev user as owner of the dev org.
insert into public.memberships (org_id, user_id, role)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'owner'
)
on conflict (org_id, user_id) do nothing;
