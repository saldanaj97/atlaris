import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseEnv } from '@/lib/config/env';

export function createSupabaseServerClient() {
  return createClient(supabaseEnv.url, supabaseEnv.publishableKey, {
    accessToken: async () => {
      const session = await auth();
      return session.getToken();
    },
  });
}
