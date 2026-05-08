import { maintenanceMode } from '@/flags';

export async function resolveEffectiveMaintenanceMode(
  envMaintenanceMode: boolean,
): Promise<boolean> {
  if (envMaintenanceMode) {
    return true;
  }

  try {
    return await maintenanceMode();
  } catch {
    return false;
  }
}
