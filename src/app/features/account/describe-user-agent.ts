import type { DeviceDescription } from './session.types';

/**
 * Turns a User-Agent into "browser + OS" for the sessions screen. Deliberately small: it only
 * needs to tell a person's own devices apart, not to detect every browser. Order matters because
 * Chromium-based browsers also claim to be Chrome and Safari.
 */
export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  const ua = userAgent ?? '';
  return { browser: browserOf(ua), os: osOf(ua), mobile: /Mobi|Android|iPhone|iPad/i.test(ua) };
}

function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navegador desconocido';
}

function osOf(ua: string): string {
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'sistema desconocido';
}
