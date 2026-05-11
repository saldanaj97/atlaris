'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ComponentProps } from 'react';

type SpeedInsightsBeforeSend = NonNullable<
  ComponentProps<typeof SpeedInsights>['beforeSend']
>;

const SPEED_INSIGHTS_SAMPLE_RATE = 0.25;

const SPEED_INSIGHTS_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/pricing\/?$/,
  /^\/dashboard\/?$/,
  /^\/plans\/new\/?$/,
  /^\/plans\/[^/]+\/?$/,
  /^\/plans\/[^/]+\/modules\/[^/]+\/?$/,
];

const filterSpeedInsights: SpeedInsightsBeforeSend = (event) => {
  const { pathname } = new URL(event.url);
  return SPEED_INSIGHTS_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))
    ? event
    : null;
};

export function VercelTelemetry() {
  return (
    <>
      <Analytics
        beforeSend={(event) => {
          if (localStorage.getItem('va-disable')) {
            return null;
          }
          return event;
        }}
      />
      <SpeedInsights
        sampleRate={SPEED_INSIGHTS_SAMPLE_RATE}
        beforeSend={filterSpeedInsights}
      />
    </>
  );
}
