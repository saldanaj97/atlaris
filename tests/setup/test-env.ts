import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Testcontainers env propagation
// ---------------------------------------------------------------------------
// When Testcontainers globalSetup provisions a Postgres container it writes
// the connection URL to a temp JSON file. Workers read it here so they get
// the correct DATABASE_URL regardless of pool type (threads / forks).
const tcEnvFile = join(__dirname, '..', '.testcontainers-env.json');
if (existsSync(tcEnvFile)) {
  try {
    const tcEnv: Record<string, string> = JSON.parse(
      readFileSync(tcEnvFile, 'utf-8')
    );
    for (const [key, value] of Object.entries(tcEnv)) {
      // Only set if not already provided (allows explicit overrides)
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // If the file is malformed, ignore — tests will fail on missing DATABASE_URL
  }
}

// Google OAuth defaults for tests – only used when not set from outside
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
}
if (!process.env.GOOGLE_REDIRECT_URI) {
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/oauth/callback';
}

// OAuth encryption default for tests
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  process.env.OAUTH_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

// Neon Auth defaults for tests
if (!process.env.NEON_AUTH_BASE_URL) {
  process.env.NEON_AUTH_BASE_URL = 'https://auth.test.neon.local';
}
if (!process.env.NEON_AUTH_COOKIE_SECRET) {
  process.env.NEON_AUTH_COOKIE_SECRET = 'test_neon_auth_cookie_secret';
}
