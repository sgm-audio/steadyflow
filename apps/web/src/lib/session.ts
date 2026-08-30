import { redirect } from 'next/navigation';
import { createApiClient } from './api-client';
import { createClient } from './supabase-server';

/**
 * Resolves the signed-in session + org for a page, redirecting to /login
 * if there is none. Every dashboard route needs this pair; centralizing it
 * here replaces the copy-pasted session/membership lookup that used to live
 * in every page file.
 */
export const requireOrgSession = async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: member } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .single();

  const orgId = member?.org_id ?? null;

  return {
    supabase,
    session,
    orgId,
    api: createApiClient(session.access_token),
  };
};
