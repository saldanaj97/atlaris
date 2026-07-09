'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';

const SETTINGS_SECTION_IDS = [
  'profile',
  'billing',
  'usage',
  'ai',
  'integrations',
  'notifications',
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

function parseSectionHash(hash: string): SettingsSectionId | undefined {
  const sectionId = hash.replace(/^#/, '');
  return SETTINGS_SECTION_IDS.includes(sectionId as SettingsSectionId)
    ? (sectionId as SettingsSectionId)
    : undefined;
}

function scrollToSection(sectionId: SettingsSectionId): void {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function SettingsScrollTarget(): ReactElement | null {
  const pathname = usePathname();

  useEffect(() => {
    const scrollFromHash = (): void => {
      const sectionId = parseSectionHash(window.location.hash);
      if (sectionId) {
        scrollToSection(sectionId);
      }
    };

    scrollFromHash();

    const retryTimeouts = [100, 500].map((delay) =>
      window.setTimeout(scrollFromHash, delay),
    );

    window.addEventListener('hashchange', scrollFromHash);

    return () => {
      for (const timeoutId of retryTimeouts) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('hashchange', scrollFromHash);
    };
  }, [pathname]);

  return null;
}
