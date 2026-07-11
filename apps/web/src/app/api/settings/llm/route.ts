import { createClient } from '../../../../lib/supabase-server';
import { NextResponse } from 'next/server';

const LLM_PROVIDERS = new Set(['deepseek', 'nvidia-nim', 'groq', 'openai-compatible']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const provider = form.get('provider');
  const defaultModel = form.get('defaultModel');

  if (typeof provider !== 'string' || !LLM_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (typeof defaultModel !== 'string' || !defaultModel || defaultModel.length > 200) {
    return NextResponse.json({ error: 'Invalid model name' }, { status: 400 });
  }

  const { data: member } = await supabase.from('memberships').select('org_id').eq('user_id', session.user.id).single();
  const orgId = (member as Record<string, unknown> | null)?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

  const { error } = await supabase
    .from('orgs')
    .update({
      default_llm_provider: provider,
      default_llm_model: defaultModel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL('/settings', request.url));
}
