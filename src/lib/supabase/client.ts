'use client';

import { useSession } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

import { createSupabasePublicEnv } from '@/lib/config/env';

const supabasePublicEnv = createSupabasePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export function useSupabaseClient() {
  const { session } = useSession();

  return createClient(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    accessToken: async () => session?.getToken() ?? null,
  });
}
