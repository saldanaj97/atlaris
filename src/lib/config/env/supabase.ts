import {
  EnvValidationError,
  requireEnvFrom,
  type EnvSource,
} from '@/lib/config/env/shared';
import { z } from 'zod';

const SupabasePublicEnvSchema = z.object({
  url: z.url({
    message: 'NEXT_PUBLIC_SUPABASE_URL must be a valid URL',
  }),
  publishableKey: z.string().min(1, {
    message: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required',
  }),
});

const SUPABASE_PUBLIC_ENV_KEY_BY_PATH = {
  url: 'NEXT_PUBLIC_SUPABASE_URL',
  publishableKey: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
} as const;

type SupabasePublicEnv = z.infer<typeof SupabasePublicEnvSchema>;

export function createSupabasePublicEnv(env: EnvSource): SupabasePublicEnv {
  const parsed = SupabasePublicEnvSchema.safeParse({
    url: requireEnvFrom(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: requireEnvFrom(env, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const key =
          SUPABASE_PUBLIC_ENV_KEY_BY_PATH[
            issue.path[0] as keyof typeof SUPABASE_PUBLIC_ENV_KEY_BY_PATH
          ] ?? issue.path.join('.');
        return `${key}: ${issue.message}`;
      })
      .join('; ');

    throw new EnvValidationError(message);
  }

  return parsed.data;
}
