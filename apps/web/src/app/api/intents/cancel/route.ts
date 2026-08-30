/**
 * POST /api/intents/cancel — Cancel a queued/running intent.
 * Proxies to the intent.cancel Edge Function procedure.
 */

import { IntentCancelInput } from '@steadyflow/core';
import { NextResponse } from 'next/server';
import { createApiClient } from '../../../../lib/api-client';
import { createClient } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });

  const parsed = IntentCancelInput.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: { message: 'Invalid intent id' } }, { status: 400 });

  const api = createApiClient(session.access_token);
  const result = await api.intentCancel(parsed.data);

  if (!result.ok) {
    const status =
      result.error.code === 'NOT_FOUND'
        ? 404
        : result.error.code === 'VALIDATION_FAILED'
          ? 409
          : 500;
    return NextResponse.json({ error: { message: result.error.message } }, { status });
  }
  return NextResponse.json(result.data);
}
