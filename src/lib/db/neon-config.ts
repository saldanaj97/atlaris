import { neonConfig } from '@neondatabase/serverless';
// @ts-expect-error ws module has no types but is used for local Neon proxy config
import ws from 'ws';

/**
 * Configures Neon client for local development with Docker-based Neon proxy.
 * This function is called automatically when the database module is imported.
 *
 * When USE_LOCAL_NEON=true:
 * - Routes HTTP requests to local Neon proxy (http://db.localtest.me:4444)
 * - Routes WebSocket connections to local proxy (db.localtest.me:4444/v2)
 * - Uses insecure WebSocket for local connections
 *
 * When USE_LOCAL_NEON is not set:
 * - Uses standard Neon configuration (remote HTTPS connections)
 */
export function configureLocalNeon() {
  if (process.env.USE_LOCAL_NEON !== 'true') {
    return;
  }

  const localHost = 'db.localtest.me';

  // Configure HTTP endpoint for local Neon proxy
  neonConfig.fetchEndpoint = (host) => {
    const [protocol, port] =
      host === localHost ? ['http', 4444] : ['https', 443];
    return `${protocol}://${host}:${port}/sql`;
  };

  // Configure WebSocket security based on host
  try {
    const connectionStringUrl = new URL(
      process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL || ''
    );
    neonConfig.useSecureWebSocket = connectionStringUrl.hostname !== localHost;
  } catch {
    // If URL parsing fails, default to secure WebSocket (production behavior)
    neonConfig.useSecureWebSocket = true;
  }

  // Configure WebSocket proxy
  neonConfig.wsProxy = (host) =>
    host === localHost ? `${host}:4444/v2` : `${host}/v2`;

  // Use native WebSocket constructor
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  neonConfig.webSocketConstructor = ws;
}
