export const ROUTES = {
  HOME: '/',
  LANDING: '/landing',
  DASHBOARD: '/dashboard',
  AUTH: {
    SIGN_IN: '/auth/sign-in',
    SIGN_UP: '/auth/sign-up',
  },
  PLANS: {
    ROOT: '/plans',
    NEW: '/plans/new',
  },
  ANALYTICS: {
    ROOT: '/analytics',
    USAGE: '/analytics/usage',
  },
  SETTINGS: {
    ROOT: '/settings',
    PROFILE: '/settings/profile',
    BILLING: '/settings/billing',
    USAGE: '/settings/usage',
    AI: '/settings/ai',
    NOTIFICATIONS: '/settings/notifications',
  },
  PRICING: '/pricing',
  ABOUT: '/about',
  WAITLIST: '/waitlist',
  TERMS: '/terms',
  PRIVACY: '/privacy',
} as const;

export function planDetailPath(planId: string): string {
  return `${ROUTES.PLANS.ROOT}/${planId}`;
}
