'use client';

import {
  SETTINGS_SECTION_IDS,
  type SettingsSectionId,
} from '@/app/(app)/settings/settings-section-ids';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';

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

function setActiveSection(sectionId: SettingsSectionId): void {
  document
    .querySelectorAll<HTMLElement>('[data-settings-section-link]')
    .forEach((link) => {
      const isActive = link.dataset.sectionId === sectionId;
      link.dataset.active = isActive ? 'true' : 'false';

      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
}

export function SettingsScrollTarget(): ReactElement | null {
  const pathname = usePathname();

  useEffect(() => {
    const scrollFromHash = (): void => {
      if (window.location.pathname !== pathname) return;

      const sectionId = parseSectionHash(window.location.hash);
      if (sectionId) {
        setActiveSection(sectionId);
        scrollToSection(sectionId);
      } else {
        setActiveSection('profile');
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
