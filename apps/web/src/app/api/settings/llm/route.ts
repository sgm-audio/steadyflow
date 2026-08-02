import { createClient } from '../../../../lib/supabase-server';
import { createApiClient } from '../../../../lib/api-client';
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

  const api = createApiClient(session.access_token);
  const result = await api.orgLlmConfigSet({
    provider: provider as 'deepseek' | 'nvidia-nim' | 'groq' | 'openai-compatible',
    defaultModel,
  });

  if (!result.ok) return NextResponse.json({ error: result.error.message }, { status: 500 });

  return NextResponse.redirect(new URL('/settings', request.url));
}
