import { createNeonAuth } from '@neondatabase/auth/next/server';
import { neonAuthEnv } from '@/lib/config/env';

export const auth = createNeonAuth({
  baseUrl: neonAuthEnv.baseUrl,
  cookies: {
    secret: neonAuthEnv.cookieSecret,
  },
});
