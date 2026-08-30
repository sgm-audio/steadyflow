/**
 * POST /auth/login — Server action for email/password login.
 */

import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase-server';

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json(
      { error: { message: 'Email and password required' } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: { message: error.message } }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
