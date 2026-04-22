'use client';

/**
 * Tracks CTA interactions on the landing page via the shared analytics util.
 * Returns helper callbacks that fire `cta_click` events with location context.
 */

import { trackEvent } from '@/lib/analytics';

type CtaLocation = 'nav' | 'hero' | 'footer';

const BUILD_MY_SCHEDULE = 'Build My Schedule';
const GENERATE_SCHEDULE_NOW = 'Generate My Schedule Now';

function trackCtaClick(location: CtaLocation, label: string): void {
	trackEvent({
		event: 'cta_click',
		label,
		location,
	});
}

export function useLandingAnalytics() {
	return {
		trackHeroCta: () => trackCtaClick('hero', BUILD_MY_SCHEDULE),
		trackFooterCta: () => trackCtaClick('footer', GENERATE_SCHEDULE_NOW),
	};
}
