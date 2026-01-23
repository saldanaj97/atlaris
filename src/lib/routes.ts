/**
 * Centralized route constants for the application.
 * Use these constants instead of hardcoded paths to ensure consistency
 * and make route changes easier to manage.
 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  PLANS: {
    ROOT: '/plans',
    NEW: '/plans/new',
  },
  ANALYTICS: {
    ROOT: '/analytics',
    USAGE: '/analytics/usage',
    ACHIEVEMENTS: '/analytics/achievements',
  },
  SETTINGS: {
    ROOT: '/settings',
    PROFILE: '/settings/profile',
    NOTIFICATIONS: '/settings/notifications',
    INTEGRATIONS: '/settings/integrations',
    BILLING: '/settings/billing',
    AI: '/settings/ai',
  },
  EXPLORE: '/explore',
  PRICING: '/pricing',
  ABOUT: '/about',
  MAINTENANCE: '/maintenance',
} as const;
