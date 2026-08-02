/**
 * POST /api/keys/test — Proxy to the keys.test procedure so the client
 * component doesn't need the user's raw access token.
 */

import { createClient } from '../../../../lib/supabase-server';
import { createApiClient } from '../../../../lib/api-client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const PROVIDERS = [
  'firecrawl', 'tavily', 'deepseek', 'nvidia-nim', 'groq', 'openai-compatible',
  'shopify-admin', 'printify', 'amazon-sp-api', 'alibaba',
] as const;

const TestKeyInput = z.object({ provider: z.enum(PROVIDERS) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }, { status: 401 });

  const parsed = TestKeyInput.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid provider' } }, { status: 400 });
  }

  const api = createApiClient(session.access_token);
  const result = await api.keysTest({ provider: parsed.data.provider });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
