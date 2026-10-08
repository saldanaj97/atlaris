import type { SiteGate } from '@/lib/proxy/middleware-policy';

import { launchWaitlist, maintenanceMode } from '@/flags';
import { appEnv } from '@/lib/config/env';
import { resolveEffectiveMaintenanceMode } from '@/lib/proxy/maintenance-mode';

/** Active site gate from Vercel Flags. Maintenance wins over the launch waitlist. */
export async function resolveSiteGate(): Promise<SiteGate | null> {
  const [maintenance, waitlist] = await Promise.all([
    resolveEffectiveMaintenanceMode(appEnv.maintenanceMode, {
      resolveMaintenanceFlag: maintenanceMode,
    }),
    // Fail open like maintenance: a flag outage must not close a launched app.
    launchWaitlist().catch(() => false),
  ]);
  if (maintenance) return 'maintenance';
  return waitlist ? 'waitlist' : null;
}
