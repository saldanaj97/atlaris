import type Stripe from 'stripe';

import { formatAmount } from '@/app/pricing/components/utils';
import { logger } from '@/lib/logging/logger';
import { getStripe } from '@/lib/stripe/client';
import {
  stripePriceFieldsSchema,
  stripeProductFieldsSchema,
} from '@/lib/validation/stripe';
import type {
  StripePriceFields,
  StripeProductFields,
} from '@/lib/validation/stripe';
import { PRICING_TIERS } from './PricingTiers';
import type { TierKey } from './PricingTiers';
export interface StripeTierData {
  name: string;
  amount: string;
}

async function retrieveStripePrices(
  stripe: ReturnType<typeof getStripe>,
  starterId: string,
  proId: string
): Promise<[Stripe.Price, Stripe.Price]> {
  try {
    return await Promise.all([
      stripe.prices.retrieve(starterId),
      stripe.prices.retrieve(proId),
    ]);
  } catch (error) {
    logger.error(
      {
        err: error,
        proId,
        starterId,
      },
      'Failed to retrieve Stripe prices for pricing page'
    );
    throw error;
  }
}

async function retrieveStripeProducts(
  stripe: ReturnType<typeof getStripe>,
  starterPrice: Stripe.Price,
  proPrice: Stripe.Price
): Promise<
  [
    Stripe.Product | Stripe.DeletedProduct,
    Stripe.Product | Stripe.DeletedProduct,
  ]
> {
  try {
    return await Promise.all([
      typeof starterPrice.product === 'string'
        ? stripe.products.retrieve(starterPrice.product)
        : Promise.resolve(starterPrice.product),
      typeof proPrice.product === 'string'
        ? stripe.products.retrieve(proPrice.product)
        : Promise.resolve(proPrice.product),
    ]);
  } catch (error) {
    logger.error(
      {
        err: error,
        proProductId: proPrice.product,
        starterProductId: starterPrice.product,
      },
      'Failed to retrieve Stripe products for pricing page'
    );
    throw error;
  }
}

function formatStripePriceAmount(price: StripePriceFields): string {
  return formatAmount(price.unit_amount, price.currency.toUpperCase());
}

function resolveStripeProductName({
  fallbackName,
  product,
  productLabel,
}: {
  fallbackName: string;
  product: StripeProductFields;
  productLabel: 'starterProduct' | 'proProduct';
}): string {
  if (product.deleted === true) {
    logger.warn(
      { [productLabel]: product },
      `[fetchStripeTierData] Stripe product "${productLabel}" was deleted; falling back to pricing tier name`
    );
    return fallbackName;
  }

  if (!product.name || product.name.trim().length === 0) {
    logger.warn(
      { [productLabel]: product },
      `[fetchStripeTierData] Stripe product "${productLabel}" is missing a usable name; falling back to pricing tier name`
    );
    return fallbackName;
  }

  return product.name;
}

export async function fetchStripeTierData({
  starterId,
  proId,
}: {
  starterId: string;
  proId: string;
}): Promise<Map<TierKey, StripeTierData>> {
  const stripe = getStripe();
  const [rawStarterPrice, rawProPrice] = await retrieveStripePrices(
    stripe,
    starterId,
    proId
  );

  const [rawStarterProduct, rawProProduct] = await retrieveStripeProducts(
    stripe,
    rawStarterPrice,
    rawProPrice
  );

  const starterPrice = stripePriceFieldsSchema.parse(rawStarterPrice);
  const proPrice = stripePriceFieldsSchema.parse(rawProPrice);
  const starterProduct = stripeProductFieldsSchema.parse(rawStarterProduct);
  const proProduct = stripeProductFieldsSchema.parse(rawProProduct);

  const starterName = resolveStripeProductName({
    fallbackName: PRICING_TIERS.starter.name,
    product: starterProduct,
    productLabel: 'starterProduct',
  });
  const proName = resolveStripeProductName({
    fallbackName: PRICING_TIERS.pro.name,
    product: proProduct,
    productLabel: 'proProduct',
  });

  const stripeData = new Map<TierKey, StripeTierData>();
  stripeData.set('starter', {
    name: starterName,
    amount: formatStripePriceAmount(starterPrice),
  });
  stripeData.set('pro', {
    name: proName,
    amount: formatStripePriceAmount(proPrice),
  });

  return stripeData;
}
