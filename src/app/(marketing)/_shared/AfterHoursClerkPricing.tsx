'use client';

import { PRICING_FEATURES_BY_CLERK_SLUG } from '@/app/(marketing)/_shared/pricing-plan-features';
import { CLERK_BILLING_PLAN_SLUGS } from '@/features/billing/clerk-billing/plan-mapping';
import { clientLogger } from '@/lib/logging/client';
import { PricingTable, SignInButton, useAuth, useClerk } from '@clerk/nextjs';
import { CheckoutButton } from '@clerk/nextjs/experimental';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';

import styles from './after-hours-pricing-cards.module.css';

type BillingPeriod = 'month' | 'annual';

type ClerkMoney = {
  amount?: number | null;
  amountFormatted?: string | null;
  currencySymbol?: string | null;
};

type ClerkPlanSnapshot = {
  id: string;
  slug: string;
  hasBaseFee: boolean;
  features: unknown[];
  fee?: ClerkMoney | null;
  annualFee?: ClerkMoney | null;
  annualMonthlyFee?: ClerkMoney | null;
};

type CheckoutMount = {
  plan: ClerkPlanSnapshot;
  target: HTMLElement;
  label: string;
};

type AfterHoursClerkPricingProps = {
  appearance: ComponentProps<typeof PricingTable>['appearance'];
  newSubscriptionRedirectUrl: string;
};

const PLAN_CTA_LABEL_BY_SLUG: Record<string, string> = {
  [CLERK_BILLING_PLAN_SLUGS.free]: 'Start free',
  [CLERK_BILLING_PLAN_SLUGS.starter]: 'Choose Starter',
  [CLERK_BILLING_PLAN_SLUGS.pro]: 'Choose Pro',
};

const PRICING_CARD_SELECTOR = '.cl-pricingTableCard';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CHECKOUT_PLAN_PARAM = 'checkoutPlan';
const CHECKOUT_PERIOD_PARAM = 'checkoutPeriod';

function buildCheckoutSignInRedirect(
  planId: string,
  period: BillingPeriod,
): string {
  const params = new URLSearchParams({
    [CHECKOUT_PLAN_PARAM]: planId,
    [CHECKOUT_PERIOD_PARAM]: period,
  });
  return `/pricing?${params.toString()}`;
}

function resetCardParallax(card: HTMLElement): void {
  card.style.setProperty('--card-tilt-x', '0deg');
  card.style.setProperty('--card-tilt-y', '0deg');
  card.style.setProperty('--card-content-x', '0px');
  card.style.setProperty('--card-content-y', '0px');
  card.style.setProperty('--card-shine-x', '50%');
  card.style.setProperty('--card-shine-y', '50%');
  card.style.setProperty('--card-shine-opacity', '0');
}

function updateCardParallax(
  card: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const bounds = card.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
  const horizontal = x - 0.5;
  const vertical = y - 0.5;

  card.style.setProperty('--card-tilt-x', `${(-vertical * 8).toFixed(2)}deg`);
  card.style.setProperty('--card-tilt-y', `${(horizontal * 10).toFixed(2)}deg`);
  card.style.setProperty(
    '--card-content-x',
    `${(horizontal * 6).toFixed(2)}px`,
  );
  card.style.setProperty('--card-content-y', `${(vertical * 6).toFixed(2)}px`);
  card.style.setProperty('--card-shine-x', `${(x * 100).toFixed(1)}%`);
  card.style.setProperty('--card-shine-y', `${(y * 100).toFixed(1)}%`);
  card.style.setProperty('--card-shine-opacity', '1');
}

function formatClerkMoney(money: ClerkMoney | null | undefined): string | null {
  if (!money || money.amount == null) return null;
  const symbol = money.currencySymbol?.trim() || '$';
  const formatted = money.amountFormatted?.trim();
  if (formatted) {
    const whole = formatted.endsWith('.00')
      ? formatted.slice(0, -3)
      : formatted;
    return `${symbol}${whole}`;
  }
  return `${symbol}${(money.amount / 100).toFixed(money.amount % 100 === 0 ? 0 : 2)}`;
}

function planHasAnnual(plan: ClerkPlanSnapshot): boolean {
  return (
    (plan.annualFee?.amount ?? 0) > 0 ||
    (plan.annualMonthlyFee?.amount ?? 0) > 0
  );
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function fillEmptyFeatureLists(
  root: HTMLElement,
  plans: ClerkPlanSnapshot[],
): void {
  for (const [slug, features] of Object.entries(
    PRICING_FEATURES_BY_CLERK_SLUG,
  )) {
    const plan = plans.find((candidate) => candidate.slug === slug);
    if (plan?.features.length) continue;

    const card = root.querySelector(`.cl-pricingTableCard__${slug}`);
    if (!(card instanceof HTMLElement)) continue;

    let list = card.querySelector('.cl-pricingTableCardFeaturesList');
    if (!(list instanceof HTMLElement)) {
      const body = card.querySelector('.cl-pricingTableCardBody');
      if (!(body instanceof HTMLElement)) continue;

      const featureSection = document.createElement('div');
      featureSection.className = 'cl-pricingTableCardFeatures';
      list = document.createElement('ul');
      list.className = 'cl-pricingTableCardFeaturesList';
      featureSection.appendChild(list);
      body.appendChild(featureSection);
    }

    const clerkItems = list.querySelectorAll(
      '.cl-pricingTableCardFeaturesListItem:not([data-atlaris-feature])',
    );
    // Prefer real Clerk Dashboard features when present.
    if (clerkItems.length > 0) {
      list
        .querySelectorAll('[data-atlaris-feature="1"]')
        .forEach((node) => node.remove());
      continue;
    }

    if (list.querySelector('[data-atlaris-feature="1"]')) continue;

    for (const text of features) {
      const li = document.createElement('li');
      li.className = 'cl-pricingTableCardFeaturesListItem';
      li.setAttribute('data-atlaris-feature', '1');
      li.setAttribute('role', 'listitem');
      li.textContent = text;
      list.appendChild(li);
    }
  }
}

function syncCardFees(
  root: HTMLElement,
  plans: ClerkPlanSnapshot[],
  period: BillingPeriod,
): void {
  for (const plan of plans) {
    if (!plan.hasBaseFee) continue;

    const card = root.querySelector(`.cl-pricingTableCard__${plan.slug}`);
    if (!(card instanceof HTMLElement)) continue;

    const feeEl = card.querySelector('.cl-pricingTableCardFee');
    const periodEl = card.querySelector('.cl-pricingTableCardFeePeriod');
    if (!(feeEl instanceof HTMLElement)) continue;

    const currentFee = feeEl.textContent?.trim();
    if (!feeEl.dataset.atlarisFeeMonth && currentFee) {
      feeEl.dataset.atlarisFeeMonth = currentFee;
    }
    if (
      periodEl instanceof HTMLElement &&
      !periodEl.dataset.atlarisPeriodMonth &&
      periodEl.textContent?.trim()
    ) {
      periodEl.dataset.atlarisPeriodMonth = periodEl.textContent.trim();
    }

    const useAnnual = period === 'annual' && planHasAnnual(plan);
    const annualDisplay =
      formatClerkMoney(plan.annualMonthlyFee) ??
      formatClerkMoney(plan.annualFee);

    if (useAnnual && annualDisplay) {
      setText(feeEl, annualDisplay);
      if (periodEl instanceof HTMLElement) {
        setText(periodEl, plan.annualMonthlyFee?.amount ? 'Month' : 'Year');
      }
    } else {
      const monthlyDisplay =
        formatClerkMoney(plan.fee) ?? feeEl.dataset.atlarisFeeMonth;
      if (monthlyDisplay) setText(feeEl, monthlyDisplay);
      if (periodEl instanceof HTMLElement) {
        const monthlyPeriod = plan.fee?.amount
          ? 'Month'
          : periodEl.dataset.atlarisPeriodMonth;
        if (monthlyPeriod) setText(periodEl, monthlyPeriod);
      }
    }
  }
}

function syncCardCtaLabels(
  root: HTMLElement,
  plans: ClerkPlanSnapshot[],
): void {
  for (const plan of plans) {
    const label = PLAN_CTA_LABEL_BY_SLUG[plan.slug];
    if (!label) continue;

    const button = root.querySelector(
      `.cl-pricingTableCard__${plan.slug} .cl-pricingTableCardFooterButton`,
    );
    if (button instanceof HTMLElement) setText(button, label);
  }
}

function reconcileCheckoutMounts(
  root: HTMLElement,
  plans: ClerkPlanSnapshot[],
): CheckoutMount[] {
  const mounts: CheckoutMount[] = [];

  for (const plan of plans) {
    if (!plan.hasBaseFee) continue;

    const card = root.querySelector(`.cl-pricingTableCard__${plan.slug}`);
    const footer = card?.querySelector('.cl-pricingTableCardFooter');
    if (!(footer instanceof HTMLElement)) continue;

    let target = footer.querySelector<HTMLElement>(
      `[data-atlaris-checkout="${plan.id}"]`,
    );
    if (!target) {
      target = document.createElement('span');
      target.dataset.atlarisCheckout = plan.id;
      target.className = styles.checkoutMount;
      footer.appendChild(target);
    }

    const nativeButton = footer.querySelector(
      '.cl-pricingTableCardFooterButton',
    );
    mounts.push({
      plan,
      target,
      label: nativeButton?.textContent?.trim() || 'Subscribe',
    });
  }

  return mounts;
}

function sameCheckoutMounts(
  current: CheckoutMount[],
  next: CheckoutMount[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (mount, index) =>
        mount.plan.id === next[index]?.plan.id &&
        mount.target === next[index]?.target &&
        mount.label === next[index]?.label,
    )
  );
}

/**
 * Clerk PricingTable with After Hours card chrome, monthly/yearly tabs,
 * and feature-list fallback when Clerk plans have empty features.
 */
export function AfterHoursClerkPricing({
  appearance,
  newSubscriptionRedirectUrl,
}: AfterHoursClerkPricingProps) {
  const { billing, loaded } = useClerk();
  const { isLoaded, userId } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<ClerkPlanSnapshot[]>([]);
  const [checkoutMounts, setCheckoutMounts] = useState<CheckoutMount[]>([]);
  const [period, setPeriod] = useState<BillingPeriod>('month');

  useEffect(() => {
    if (!loaded || !billing) return;

    let cancelled = false;

    void billing
      .getPlans()
      .then((result) => {
        if (!cancelled) setPlans(result.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clientLogger.error('Failed to load Clerk billing plans', {
          context: 'after-hours-pricing',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [billing, loaded]);

  useEffect(() => {
    if (!userId || plans.length === 0) return;

    const url = new URL(window.location.href);
    const requestedPlanId = url.searchParams.get(CHECKOUT_PLAN_PARAM);
    const requestedPeriod = url.searchParams.get(CHECKOUT_PERIOD_PARAM);
    if (!requestedPlanId && !requestedPeriod) return;

    const requestedPlan = plans.find(
      (plan) => plan.hasBaseFee && plan.id === requestedPlanId,
    );
    if (
      requestedPlan &&
      (requestedPeriod === 'month' || requestedPeriod === 'annual')
    ) {
      // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- synchronizes Clerk's post-auth return URL with the controlled period selector.
      setPeriod(
        requestedPeriod === 'annual' && planHasAnnual(requestedPlan)
          ? 'annual'
          : 'month',
      );
    }

    url.searchParams.delete(CHECKOUT_PLAN_PARAM);
    url.searchParams.delete(CHECKOUT_PERIOD_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }, [plans, userId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => {
      fillEmptyFeatureLists(root, plans);
      syncCardFees(root, plans, period);
      syncCardCtaLabels(root, plans);

      if (!isLoaded) {
        root
          .querySelectorAll<HTMLElement>('[data-atlaris-checkout]')
          .forEach((node) => node.remove());
        setCheckoutMounts([]);
        return;
      }

      const nextMounts = reconcileCheckoutMounts(root, plans);
      setCheckoutMounts((current) =>
        sameCheckoutMounts(current, nextMounts) ? current : nextMounts,
      );
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isLoaded, period, plans, userId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.matchMedia !== 'function') return;

    const finePointer = window.matchMedia(FINE_POINTER_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let activeCard: HTMLElement | null = null;
    let frameId: number | null = null;
    let pendingPointer: {
      card: HTMLElement;
      clientX: number;
      clientY: number;
    } | null = null;

    const cancelPendingFrame = () => {
      pendingPointer = null;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };

    const resetActiveCard = () => {
      cancelPendingFrame();
      if (activeCard) resetCardParallax(activeCard);
      activeCard = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || reducedMotion.matches) {
        resetActiveCard();
        return;
      }

      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(PRICING_CARD_SELECTOR)
          : null;

      if (!card || !root.contains(card)) {
        resetActiveCard();
        return;
      }

      if (activeCard && activeCard !== card) resetCardParallax(activeCard);
      activeCard = card;
      pendingPointer = {
        card,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (!pendingPointer) return;
        updateCardParallax(
          pendingPointer.card,
          pendingPointer.clientX,
          pendingPointer.clientY,
        );
        pendingPointer = null;
      });
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!activeCard) return;
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && activeCard.contains(nextTarget)) return;
      resetActiveCard();
    };

    const handleCapabilityChange = () => {
      if (!finePointer.matches || reducedMotion.matches) resetActiveCard();
    };

    window.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerout', handlePointerOut);
    root.addEventListener('pointerleave', resetActiveCard);
    root.addEventListener('pointercancel', resetActiveCard);
    finePointer.addEventListener('change', handleCapabilityChange);
    reducedMotion.addEventListener('change', handleCapabilityChange);

    return () => {
      resetActiveCard();
      window.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerout', handlePointerOut);
      root.removeEventListener('pointerleave', resetActiveCard);
      root.removeEventListener('pointercancel', resetActiveCard);
      finePointer.removeEventListener('change', handleCapabilityChange);
      reducedMotion.removeEventListener('change', handleCapabilityChange);
    };
  }, []);

  return (
    <div className={styles.stack}>
      <div className={styles.periodDock}>
        <div
          aria-label='Billing period'
          className={styles.periodList}
          role='group'
        >
          <button
            aria-pressed={period === 'month'}
            className={styles.periodTrigger}
            data-state={period === 'month' ? 'active' : 'inactive'}
            onClick={() => setPeriod('month')}
            type='button'
          >
            Monthly
          </button>
          <button
            aria-pressed={period === 'annual'}
            className={styles.periodTrigger}
            data-state={period === 'annual' ? 'active' : 'inactive'}
            onClick={() => setPeriod('annual')}
            type='button'
          >
            Yearly
          </button>
        </div>
      </div>

      <div ref={rootRef} className={styles.cards} data-plan-period={period}>
        <PricingTable
          appearance={appearance}
          newSubscriptionRedirectUrl={newSubscriptionRedirectUrl}
        />
        {checkoutMounts.map(({ label, plan, target }) => {
          const planPeriod =
            period === 'annual' && planHasAnnual(plan) ? 'annual' : 'month';

          return createPortal(
            userId ? (
              <CheckoutButton
                checkoutProps={{ appearance }}
                newSubscriptionRedirectUrl={newSubscriptionRedirectUrl}
                planId={plan.id}
                planPeriod={planPeriod}
              >
                <button className={styles.checkoutButton} type='button'>
                  {label}
                </button>
              </CheckoutButton>
            ) : (
              <SignInButton
                forceRedirectUrl={buildCheckoutSignInRedirect(
                  plan.id,
                  planPeriod,
                )}
                mode='modal'
                signUpForceRedirectUrl={buildCheckoutSignInRedirect(
                  plan.id,
                  planPeriod,
                )}
                withSignUp
              >
                <button className={styles.checkoutButton} type='button'>
                  {label}
                </button>
              </SignInButton>
            ),
            target,
            plan.id,
          );
        })}
      </div>
    </div>
  );
}
