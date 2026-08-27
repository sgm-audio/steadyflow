import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@steadyflow/db';

const getEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required env var: ${key}. Set in .env.local for development or Vercel dashboard for production.`);
  }
  return val;
};

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
};
