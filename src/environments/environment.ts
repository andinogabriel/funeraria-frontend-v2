/**
 * Default (development) environment. Read by `core/env/env.service.ts`. The dev server's
 * proxy.conf.json forwards `/api` and `/actuator` to the backend on :8081, so a relative
 * `/api` base URL works without CORS during development.
 *
 * For production deployments, replace this file at build time using the `fileReplacements`
 * mechanism in angular.json (added when the prod environment file lands).
 */
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  deviceType: 'web-browser',
} as const;
