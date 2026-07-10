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
