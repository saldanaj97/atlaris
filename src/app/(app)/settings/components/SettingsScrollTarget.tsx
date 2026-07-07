'use client';

import { useEffect, type ReactElement } from 'react';

export type SettingsSectionId =
  | 'profile'
  | 'billing'
  | 'usage'
  | 'ai'
  | 'integrations'
  | 'notifications';

export function SettingsScrollTarget({
  sectionId,
}: {
  sectionId?: SettingsSectionId;
}): ReactElement | null {
  useEffect(() => {
    if (!sectionId) {
      return;
    }

    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sectionId]);

  return null;
}
