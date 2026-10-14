import type {
  BillingPeriod,
  PricingMoney,
  PricingPlan,
} from './pricing-card-model';
import type { ChangeEvent } from 'react';

import { formatPricingMoney } from './PricingCards';
import { ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

import styles from './PricingCards.module.css';

type MoneyWithCurrency = PricingMoney & { currency?: string | null };

/** Charge that Clerk Billing makes for this plan and period (not the per-month display price). */
function billedMoney(
  plan: PricingPlan,
  period: BillingPeriod,
): MoneyWithCurrency | null {
  return period === 'annual' ? (plan.annualFee ?? plan.fee) : plan.fee;
}

type RenewalDisclosureProps = {
  id?: string;
  plan: PricingPlan;
  period: BillingPeriod;
};

/**
 * Automatic-renewal terms shown directly above a paid plan's subscribe button
 * (California Automatic Renewal Law point-of-purchase disclosure).
 */
export function RenewalDisclosure({
  id,
  plan,
  period,
}: RenewalDisclosureProps) {
  const money = billedMoney(plan, period);
  const currency = money?.currency?.trim().toUpperCase() || 'USD';
  const cadence = period === 'annual' ? 'yearly' : 'monthly';
  const interval = period === 'annual' ? 'year' : 'month';

  return (
    <p className={styles.renewalDisclosure} id={id}>
      {formatPricingMoney(money)} {currency} billed {cadence}. Renews
      automatically every {interval} until you cancel. Cancel anytime in
      Settings → Billing; cancellation takes effect at the end of the billing
      period. No refunds. See the{' '}
      <Link
        className={styles.renewalLink}
        href={ROUTES.TERMS}
        rel='noopener'
        target='_blank'
      >
        Terms of Service
      </Link>
      .
    </p>
  );
}

type RenewalConsentProps = RenewalDisclosureProps & {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
};

/** Disclosure plus the required, unchecked-by-default consent checkbox. */
export function RenewalConsent({
  agreed,
  onAgreedChange,
  period,
  plan,
}: RenewalConsentProps) {
  const baseId = `renewal-${plan.slug}-${period}`;
  const cadence = period === 'annual' ? 'yearly' : 'monthly';

  return (
    <div className={styles.renewalConsent}>
      <RenewalDisclosure id={`${baseId}-terms`} period={period} plan={plan} />
      <div className={styles.renewalCheckboxRow}>
        <input
          aria-describedby={`${baseId}-terms`}
          checked={agreed}
          className={styles.renewalCheckbox}
          id={`${baseId}-consent`}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onAgreedChange(event.target.checked)
          }
          required
          type='checkbox'
        />
        <label
          className={styles.renewalCheckboxLabel}
          htmlFor={`${baseId}-consent`}
        >
          I agree to automatic {cadence} renewal and the{' '}
          <Link
            className={styles.renewalLink}
            href={ROUTES.TERMS}
            rel='noopener'
            target='_blank'
          >
            Terms of Service
          </Link>
          .
        </label>
      </div>
    </div>
  );
}
