import { auth } from '@clerk/nextjs/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from '@/lib/config/env';

export async function createClient() {
  return createSupabaseClient(supabaseEnv.url, supabaseEnv.anonKey, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}
