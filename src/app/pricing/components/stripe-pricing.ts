import { getStripe } from '@/lib/stripe/client';
import { PRICING_TIERS, type TierKey } from './PricingTiers';
import { formatAmount } from './utils';

export interface StripeTierData {
  name: string;
  amount: string;
}

export async function fetchStripeTierData({
  starterId,
  proId,
}: {
  starterId: string;
  proId: string;
}): Promise<Map<TierKey, StripeTierData>> {
  const stripe = getStripe();
  const [starterPrice, proPrice] = await Promise.all([
    stripe.prices.retrieve(starterId),
    stripe.prices.retrieve(proId),
  ]);

  // Expand products individually to safely access product names across API versions
  const [starterProduct, proProduct] = await Promise.all([
    typeof starterPrice.product === 'string'
      ? stripe.products.retrieve(starterPrice.product)
      : Promise.resolve(starterPrice.product),
    typeof proPrice.product === 'string'
      ? stripe.products.retrieve(proPrice.product)
      : Promise.resolve(proPrice.product),
  ]);

  const starterName =
    (starterProduct && 'name' in starterProduct && starterProduct.name) ||
    PRICING_TIERS.starter.name;
  const proName =
    (proProduct && 'name' in proProduct && proProduct.name) ||
    PRICING_TIERS.pro.name;

  const stripeData = new Map<TierKey, StripeTierData>();
  stripeData.set('starter', {
    name: starterName,
    amount: formatAmount(
      starterPrice.unit_amount,
      starterPrice.currency?.toUpperCase()
    ),
  });
  stripeData.set('pro', {
    name: proName,
    amount: formatAmount(
      proPrice.unit_amount,
      proPrice.currency?.toUpperCase()
    ),
  });

  return stripeData;
}
