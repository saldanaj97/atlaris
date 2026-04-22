/**
 * Pricing-page catalog reads use `getStripe()` directly (not `StripeCommerceBoundary`)
 * so marketing SSR stays decoupled from checkout/portal/webhook orchestration.
 * See issue #306 — a future narrow catalog-read port could fold this in if needed.
 */
import type Stripe from 'stripe';
import { PRICING_TIERS } from '@/app/pricing/components/PricingTiers';
import { formatAmount } from '@/app/pricing/components/utils';
import { getStripe } from '@/features/billing/client';
import { localDisplayAmountForTier } from '@/features/billing/local-catalog';
import type {
	StripePriceFields,
	StripeProductFields,
} from '@/features/billing/validation/stripe';
import {
	stripePriceFieldsSchema,
	stripeProductFieldsSchema,
} from '@/features/billing/validation/stripe';
import { stripeEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';
export interface StripeTierData {
	name: string;
	amount: string;
}

async function retrieveStripePrices(
	stripe: ReturnType<typeof getStripe>,
	starterId: string,
	proId: string,
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
			'Failed to retrieve Stripe prices for pricing page',
		);
		throw error;
	}
}

async function retrieveStripeProducts(
	stripe: ReturnType<typeof getStripe>,
	starterPrice: Stripe.Price,
	proPrice: Stripe.Price,
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
			'Failed to retrieve Stripe products for pricing page',
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
			`[fetchStripeTierData] Stripe product "${productLabel}" was deleted; falling back to pricing tier name`,
		);
		return fallbackName;
	}

	if (!product.name || product.name.trim().length === 0) {
		logger.warn(
			{ [productLabel]: product },
			`[fetchStripeTierData] Stripe product "${productLabel}" is missing a usable name; falling back to pricing tier name`,
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
}): Promise<Map<SubscriptionTier, StripeTierData>> {
	if (stripeEnv.localMode) {
		const map = new Map<SubscriptionTier, StripeTierData>();
		const starterInterval = starterId.includes('yearly') ? 'yearly' : 'monthly';
		const proInterval = proId.includes('yearly') ? 'yearly' : 'monthly';
		map.set('starter', {
			name: PRICING_TIERS.starter.name,
			amount: localDisplayAmountForTier('starter', starterInterval),
		});
		map.set('pro', {
			name: PRICING_TIERS.pro.name,
			amount: localDisplayAmountForTier('pro', proInterval),
		});
		return map;
	}

	const stripe = getStripe();
	const [rawStarterPrice, rawProPrice] = await retrieveStripePrices(
		stripe,
		starterId,
		proId,
	);

	const [rawStarterProduct, rawProProduct] = await retrieveStripeProducts(
		stripe,
		rawStarterPrice,
		rawProPrice,
	);

	const starterPriceResult = stripePriceFieldsSchema.safeParse(rawStarterPrice);
	const proPriceResult = stripePriceFieldsSchema.safeParse(rawProPrice);
	const starterProductResult =
		stripeProductFieldsSchema.safeParse(rawStarterProduct);
	const proProductResult = stripeProductFieldsSchema.safeParse(rawProProduct);

	const stripeData = new Map<SubscriptionTier, StripeTierData>();

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
			'[fetchStripeTierData] Stripe starter data failed validation; omitting from pricing map',
		);
	} else {
		stripeData.set('starter', {
			name: resolveStripeProductName({
				fallbackName: PRICING_TIERS.starter.name,
				product: starterProductResult.data,
				productLabel: 'starterProduct',
			}),
			amount: formatStripePriceAmount(starterPriceResult.data),
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
			'[fetchStripeTierData] Stripe pro data failed validation; omitting from pricing map',
		);
	} else {
		stripeData.set('pro', {
			name: resolveStripeProductName({
				fallbackName: PRICING_TIERS.pro.name,
				product: proProductResult.data,
				productLabel: 'proProduct',
			}),
			amount: formatStripePriceAmount(proPriceResult.data),
		});
	}

	return stripeData;
}
