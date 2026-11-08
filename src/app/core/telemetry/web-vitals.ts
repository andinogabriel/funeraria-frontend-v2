import { inject, provideAppInitializer } from '@angular/core';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

import { ClientTelemetryService } from './client-telemetry.service';

/**
 * Registers the Core Web Vitals observers at bootstrap. Each metric is reported once per page
 * load, when the browser finalises it (typically when the tab is hidden).
 */
export function provideWebVitalsReporting() {
  return provideAppInitializer(() => {
    const telemetry = inject(ClientTelemetryService);
    const report = (metric: Metric) =>
      telemetry.reportWebVital(metric.name, metric.value, metric.rating);
    onCLS(report);
    onFCP(report);
    onINP(report);
    onLCP(report);
    onTTFB(report);
  });
}
