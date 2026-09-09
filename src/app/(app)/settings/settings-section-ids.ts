import { ROUTES } from '@/features/navigation/routes';

export const SETTINGS_SECTIONS = {
  profile: 'profile',
  billing: 'billing',
  usage: 'usage',
  ai: 'ai',
  integrations: 'integrations',
  notifications: 'notifications',
} as const;

export const SETTINGS_SECTION_IDS = Object.values(SETTINGS_SECTIONS);

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

const SETTINGS_SECTION_PATHS = {
  [SETTINGS_SECTIONS.profile]: ROUTES.SETTINGS.PROFILE,
  [SETTINGS_SECTIONS.billing]: ROUTES.SETTINGS.BILLING,
  [SETTINGS_SECTIONS.usage]: ROUTES.SETTINGS.USAGE,
  [SETTINGS_SECTIONS.ai]: ROUTES.SETTINGS.AI,
  [SETTINGS_SECTIONS.integrations]: ROUTES.SETTINGS.INTEGRATIONS,
  [SETTINGS_SECTIONS.notifications]: ROUTES.SETTINGS.NOTIFICATIONS,
} as const satisfies Record<SettingsSectionId, string>;

export function settingsSectionPath(sectionId: SettingsSectionId): string {
  return SETTINGS_SECTION_PATHS[sectionId];
}

export function parseSettingsSectionHash(
  hash: string,
): SettingsSectionId | undefined {
  const sectionId = hash.replace(/^#/, '');
  return SETTINGS_SECTION_IDS.includes(sectionId as SettingsSectionId)
    ? (sectionId as SettingsSectionId)
    : undefined;
}

export function getSettingsSectionIdFromPathname(
  pathname: string,
): SettingsSectionId {
  const prefix = `${ROUTES.SETTINGS.ROOT}/`;
  if (!pathname.startsWith(prefix)) {
    return SETTINGS_SECTIONS.profile;
  }

  const firstSegment = pathname.slice(prefix.length).split('/')[0] ?? '';
  return SETTINGS_SECTION_IDS.includes(firstSegment as SettingsSectionId)
    ? (firstSegment as SettingsSectionId)
    : SETTINGS_SECTIONS.profile;
}
