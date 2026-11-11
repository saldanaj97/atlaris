import {
  CREATE_PLAN_LABEL,
  resolveCreatePlanCta,
  resolveMarketingCreatePlanCta,
  resolveMarketingPrimaryCta,
} from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { describe, expect, it } from 'vitest';

describe('resolveCreatePlanCta', () => {
  it('hides the action while authenticated entitlement is still unknown', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: undefined })).toBeNull();
  });

  it('sends entitled users to the plan form', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: true })).toEqual({
      href: ROUTES.PLANS.NEW,
      label: CREATE_PLAN_LABEL,
    });
  });

  it('sends blocked users to pricing', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: false })).toEqual({
      href: ROUTES.PRICING,
      label: 'Upgrade',
    });
  });

  it('hides the create action on the plan form itself', () => {
    expect(
      resolveCreatePlanCta({ canCreatePlan: true, pathname: ROUTES.PLANS.NEW }),
    ).toBeNull();
  });

  it('keeps Upgrade for blocked users on the plan form', () => {
    expect(
      resolveCreatePlanCta({
        canCreatePlan: false,
        pathname: ROUTES.PLANS.NEW,
      }),
    ).toEqual({ href: ROUTES.PRICING, label: 'Upgrade' });
  });
});

describe('resolveMarketingPrimaryCta', () => {
  it('sends signed-in visitors to the dashboard', () => {
    expect(
      resolveMarketingPrimaryCta({
        isAuthenticated: true,
        pathname: '/landing',
      }),
    ).toEqual({ href: ROUTES.DASHBOARD, label: 'Dashboard' });
  });

  it('offers the plan form on marketing pages', () => {
    expect(
      resolveMarketingPrimaryCta({
        isAuthenticated: false,
        pathname: '/landing',
      }),
    ).toEqual({ href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL });
  });

  it.each(['/auth/sign-in', '/auth/sign-in/factor-one', '/auth/sign-up'])(
    'offers sign-up on %s',
    (pathname) => {
      expect(
        resolveMarketingPrimaryCta({ isAuthenticated: false, pathname }),
      ).toEqual({ href: ROUTES.AUTH.SIGN_UP, label: 'Sign up' });
    },
  );

  it('does not treat look-alike paths as auth pages', () => {
    expect(
      resolveMarketingPrimaryCta({
        isAuthenticated: false,
        pathname: '/auth/sign-inx',
      }),
    ).toEqual({ href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL });
  });
});

describe('resolveMarketingCreatePlanCta', () => {
  it('sends a signed-out visitor to sign-up, back to the plan form', () => {
    expect(resolveMarketingCreatePlanCta({ isAuthenticated: false })).toEqual({
      href: '/auth/sign-up?redirect_url=%2Fplans%2Fnew',
      label: CREATE_PLAN_LABEL,
    });
  });

  it('sends a signed-in user with no subscription to pricing', () => {
    expect(
      resolveMarketingCreatePlanCta({
        isAuthenticated: true,
        canCreatePlan: false,
      }),
    ).toEqual({ href: ROUTES.PRICING, label: 'Choose a plan' });
  });

  it.each([true, undefined])(
    'sends a subscribed user (entitlement %s) to the plan form',
    (canCreatePlan) => {
      expect(
        resolveMarketingCreatePlanCta({ isAuthenticated: true, canCreatePlan }),
      ).toEqual({ href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL });
    },
  );
});
