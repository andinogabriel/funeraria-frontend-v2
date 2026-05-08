import { environment } from '../../../environments/environment';
import type { DeviceInfo } from './auth.types';

const DEVICE_ID_STORAGE_KEY = 'funeraria.device-id';

/**
 * Returns a stable device identifier for the current browser, generating one on first call
 * and persisting it in localStorage. The backend binds every issued JWT to the
 * `deviceId` declared at login, so this id must remain identical across page loads — using
 * `crypto.randomUUID()` once and reading it back from storage on subsequent visits keeps
 * the session intact through navigations and reloads.
 *
 * Clearing site data (or running in a private window) yields a fresh id, which is the
 * intended behavior: the previous session is no longer recoverable from this browser.
 */
export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

/** Convenience constructor for the `DeviceInfo` payload required by login/refresh/logout. */
export function getDeviceInfo(): DeviceInfo {
  return {
    deviceId: getOrCreateDeviceId(),
    deviceType: environment.deviceType,
  };
}
