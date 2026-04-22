import 'stripe';

declare module 'stripe' {
	namespace Stripe {
		interface Invoice {
			subscription?: string | Subscription | null;
		}
	}
}
