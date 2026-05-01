import { getStripe } from '@/features/billing/client';
import {
  type LocalBillingCatalogEntry,
  localCatalogEntryFromPriceId,
} from '@/features/billing/local-catalog';
import { formatAmount } from '@/features/billing/money';
import type {
  StripePriceFields,
  StripeProductFields,
} from '@/features/billing/validation/stripe';
import {
  stripePriceFieldsSchema,
  stripeProductFieldsSchema,
} from '@/features/billing/validation/stripe';
import { stripeEnv } from '@/lib/config/env';
import { logger as appLogger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/** Display names aligned with marketing `PRICING_TIERS`; billing owns read fallback strings. */
export const BILLING_CATALOG_FALLBACK_PRODUCT_NAMES = {
  starter: 'Starter',
  pro: 'Pro',
} as const;

export interface BillingCatalogTierData {
  name: string;
  amount: string;
}

export interface BillingCatalogStripeClient {
  retrievePrice(priceId: string): Promise<unknown>;
  retrieveProduct(productId: string): Promise<unknown>;
}

export interface BillingCatalogLogger {
  error: (meta: Record<string, unknown>, message: string) => void;
  warn: (meta: Record<string, unknown>, message: string) => void;
}

export interface BillingCatalogReadDeps {
  localMode: boolean;
  stripe: BillingCatalogStripeClient;
  logger: BillingCatalogLogger;
}

export interface ReadBillingCatalogInput {
  interval: 'monthly' | 'yearly';
  starterId: string;
  proId: string;
}

function defaultDeps(): BillingCatalogReadDeps {
  const client = getStripe();
  const logError = appLogger.error.bind(
    appLogger,
  ) as BillingCatalogLogger['error'];
  const logWarn = appLogger.warn.bind(
    appLogger,
  ) as BillingCatalogLogger['warn'];

  return {
    localMode: stripeEnv.localMode,
    stripe: {
      retrievePrice: (priceId: string) => client.prices.retrieve(priceId),
      retrieveProduct: (productId: string) =>
        client.products.retrieve(productId),
    },
    logger: { error: logError, warn: logWarn },
  };
}

function mergeDeps(
  partial?: Partial<BillingCatalogReadDeps>,
): BillingCatalogReadDeps {
  if (
    partial?.stripe != null &&
    partial.logger != null &&
    typeof partial.localMode === 'boolean'
  ) {
    return {
      localMode: partial.localMode,
      stripe: partial.stripe,
      logger: partial.logger,
    };
  }

  const base = defaultDeps();
  return {
    localMode: partial?.localMode ?? base.localMode,
    stripe: partial?.stripe ?? base.stripe,
    logger: partial?.logger ?? base.logger,
  };
}

function formatValidatedPrice(price: StripePriceFields): string {
  return formatAmount(price.unit_amount, price.currency.toUpperCase());
}

function resolveStripeProductName({
  fallbackName,
  product,
  productLabel,
  logger,
}: {
  fallbackName: string;
  product: StripeProductFields;
  productLabel: 'starterProduct' | 'proProduct';
  logger: BillingCatalogLogger;
}): string {
  if (product.deleted === true) {
    logger.warn(
      { [productLabel]: product },
      `[readBillingCatalogTierData] Stripe product "${productLabel}" was deleted; falling back to pricing tier name`,
    );
    return fallbackName;
  }

  if (!product.name || product.name.trim().length === 0) {
    logger.warn(
      { [productLabel]: product },
      `[readBillingCatalogTierData] Stripe product "${productLabel}" is missing a usable name; falling back to pricing tier name`,
    );
    return fallbackName;
  }

  return product.name;
}

async function retrieveStripePaidPrices(
  stripe: BillingCatalogStripeClient,
  logger: BillingCatalogLogger,
  starterId: string,
  proId: string,
): Promise<[unknown, unknown]> {
  try {
    return await Promise.all([
      stripe.retrievePrice(starterId),
      stripe.retrievePrice(proId),
    ]);
  } catch (error) {
    logger.error(
      {
        err: error,
        proId,
        starterId,
      },
      'Failed to retrieve Stripe prices for billing catalog read',
    );
    throw error;
  }
}

function readStripePriceProduct(price: unknown): unknown {
  if (!price || typeof price !== 'object' || !('product' in price)) {
    return undefined;
  }
  return (price as { product: unknown }).product;
}

async function retrieveStripePaidProducts(
  stripe: BillingCatalogStripeClient,
  logger: BillingCatalogLogger,
  starterRaw: unknown,
  proRaw: unknown,
): Promise<[unknown, unknown]> {
  const starterProduct = readStripePriceProduct(starterRaw);
  const proProduct = readStripePriceProduct(proRaw);

  try {
    return await Promise.all([
      typeof starterProduct === 'string'
        ? stripe.retrieveProduct(starterProduct)
        : Promise.resolve(starterProduct),
      typeof proProduct === 'string'
        ? stripe.retrieveProduct(proProduct)
        : Promise.resolve(proProduct),
    ]);
  } catch (error) {
    logger.error(
      {
        err: error,
        proProductId: proProduct,
        starterProductId: starterProduct,
      },
      'Failed to retrieve Stripe products for billing catalog read',
    );
    throw error;
  }
}

function validatedLocalPaidEntry(
  priceId: string,
  tier: Exclude<SubscriptionTier, 'free'>,
  interval: ReadBillingCatalogInput['interval'],
  logger: BillingCatalogLogger,
): LocalBillingCatalogEntry | null {
  const entry = localCatalogEntryFromPriceId(priceId);

  if (!entry) {
    logger.warn(
      { expectedInterval: interval, expectedTier: tier, priceId },
      '[readBillingCatalogTierData] Local mode requires canonical local catalog price ids; omitting tier from pricing map',
    );
    return null;
  }

  if (entry.tier !== tier || entry.interval !== interval) {
    logger.warn(
      { expectedInterval: interval, expectedTier: tier, priceId },
      '[readBillingCatalogTierData] Price id interval/tier mismatch in local catalog; omitting tier from pricing map',
    );
    return null;
  }

  return entry;
}

function readLocalBillingCatalog(
  input: ReadBillingCatalogInput,
  logger: BillingCatalogLogger,
): Map<SubscriptionTier, BillingCatalogTierData> {
  const { interval, starterId, proId } = input;
  const result = new Map<SubscriptionTier, BillingCatalogTierData>();

  const starterEntry = validatedLocalPaidEntry(
    starterId,
    'starter',
    interval,
    logger,
  );
  if (starterEntry) {
    result.set('starter', {
      name: BILLING_CATALOG_FALLBACK_PRODUCT_NAMES.starter,
      amount: starterEntry.displayAmount,
    });
  }

  const proEntry = validatedLocalPaidEntry(proId, 'pro', interval, logger);
  if (proEntry) {
    result.set('pro', {
      name: BILLING_CATALOG_FALLBACK_PRODUCT_NAMES.pro,
      amount: proEntry.displayAmount,
    });
  }

  return result;
}

async function readLiveBillingCatalog(
  input: ReadBillingCatalogInput,
  deps: BillingCatalogReadDeps,
): Promise<Map<SubscriptionTier, BillingCatalogTierData>> {
  const { starterId, proId } = input;
  const { stripe, logger } = deps;

  const [rawStarterPrice, rawProPrice] = await retrieveStripePaidPrices(
    stripe,
    logger,
    starterId,
    proId,
  );

  const [rawStarterProduct, rawProProduct] = await retrieveStripePaidProducts(
    stripe,
    logger,
    rawStarterPrice,
    rawProPrice,
  );

  const starterPriceResult = stripePriceFieldsSchema.safeParse(rawStarterPrice);
  const proPriceResult = stripePriceFieldsSchema.safeParse(rawProPrice);
  const starterProductResult =
    stripeProductFieldsSchema.safeParse(rawStarterProduct);
  const proProductResult = stripeProductFieldsSchema.safeParse(rawProProduct);

  const tierDisplayMap = new Map<SubscriptionTier, BillingCatalogTierData>();

  if (!starterPriceResult.success || !starterProductResult.success) {
    logger.warn(
      {
        priceError: starterPriceResult.success
          ? undefined
          : starterPriceResult.error,
        productError: starterProductResult.success
          ? undefined
          : starterProductResult.error,
      },
      '[readBillingCatalogTierData] Stripe starter data failed validation; omitting from pricing map',
    );
  } else {
    tierDisplayMap.set('starter', {
      name: resolveStripeProductName({
        fallbackName: BILLING_CATALOG_FALLBACK_PRODUCT_NAMES.starter,
        product: starterProductResult.data,
        productLabel: 'starterProduct',
        logger,
      }),
      amount: formatValidatedPrice(starterPriceResult.data),
    });
  }

  if (!proPriceResult.success || !proProductResult.success) {
    logger.warn(
      {
        priceError: proPriceResult.success ? undefined : proPriceResult.error,
        productError: proProductResult.success
          ? undefined
          : proProductResult.error,
      },
      '[readBillingCatalogTierData] Stripe pro data failed validation; omitting from pricing map',
    );
  } else {
    tierDisplayMap.set('pro', {
      name: resolveStripeProductName({
        fallbackName: BILLING_CATALOG_FALLBACK_PRODUCT_NAMES.pro,
        product: proProductResult.data,
        productLabel: 'proProduct',
        logger,
      }),
      amount: formatValidatedPrice(proPriceResult.data),
    });
  }

  return tierDisplayMap;
}

/**
 * Reads paid-tier display facts for the marketing pricing page.
 * Marketing stays decoupled from checkout/portal/webhook (`StripeCommerceBoundary`).
 */
export async function readBillingCatalogTierData(
  input: ReadBillingCatalogInput,
  deps?: Partial<BillingCatalogReadDeps>,
): Promise<Map<SubscriptionTier, BillingCatalogTierData>> {
  const resolved = mergeDeps(deps);

  if (resolved.localMode) {
    return readLocalBillingCatalog(input, resolved.logger);
  }

  return readLiveBillingCatalog(input, resolved);
}
