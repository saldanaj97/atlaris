import * as Sentry from '@sentry/nextjs';

type MetricOptions = Parameters<typeof Sentry.metrics.count>[2];

export type AtlarisMetricName = `atlaris.${string}`;
export type MetricAttributes = NonNullable<MetricOptions>['attributes'];

export type ApplicationMetricOptions = {
  attributes?: MetricAttributes;
  unit?: string;
};

function isSentryMetricsEnabled(): boolean {
  const serverFlag =
    typeof process !== 'undefined' ? process.env.ENABLE_SENTRY : undefined;
  const publicFlag =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_ENABLE_SENTRY
      : undefined;
  const flag = serverFlag ?? publicFlag;

  return flag?.trim().toLowerCase() !== 'false';
}

function toMetricOptions(
  options: ApplicationMetricOptions | undefined,
): MetricOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    attributes: options.attributes,
    unit: options.unit,
  };
}

function shouldCaptureMetric(value: number): boolean {
  return isSentryMetricsEnabled() && Number.isFinite(value);
}

export function countMetric(
  name: AtlarisMetricName,
  value = 1,
  options?: ApplicationMetricOptions,
): void {
  if (!shouldCaptureMetric(value)) {
    return;
  }

  Sentry.metrics.count(name, value, toMetricOptions(options));
}

export function gaugeMetric(
  name: AtlarisMetricName,
  value: number,
  options?: ApplicationMetricOptions,
): void {
  if (!shouldCaptureMetric(value)) {
    return;
  }

  Sentry.metrics.gauge(name, value, toMetricOptions(options));
}

export function distributionMetric(
  name: AtlarisMetricName,
  value: number,
  options?: ApplicationMetricOptions,
): void {
  if (!shouldCaptureMetric(value)) {
    return;
  }

  Sentry.metrics.distribution(name, value, toMetricOptions(options));
}
