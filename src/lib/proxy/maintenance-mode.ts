export type ResolveMaintenanceFlag = () => Promise<boolean>;

export async function resolveEffectiveMaintenanceMode(
  envMaintenanceMode: boolean,
  options: { resolveMaintenanceFlag: ResolveMaintenanceFlag },
): Promise<boolean> {
  if (envMaintenanceMode) {
    return true;
  }

  try {
    return await options.resolveMaintenanceFlag();
  } catch {
    return false;
  }
}
