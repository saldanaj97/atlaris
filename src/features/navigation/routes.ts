/**
 * Centralized route constants for the application.
 * Use these constants instead of hardcoded paths to ensure consistency
 * and make route changes easier to manage.
 */
export const ROUTES = {
  HOME: '/',
  LANDING: '/landing',
  DASHBOARD: '/dashboard',
  AUTH: {
    SIGN_IN: '/auth/sign-in',
  },
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
  },
  PRICING: '/pricing',
  MAINTENANCE: '/maintenance',
} as const;

export function planDetailPath(planId: string): string {
  return `${ROUTES.PLANS.ROOT}/${planId}`;
}
