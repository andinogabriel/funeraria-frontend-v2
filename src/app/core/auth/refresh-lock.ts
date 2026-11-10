const REFRESH_LOCK = 'funeraria.auth.refresh';

/**
 * Runs `task` while holding a lock shared by every tab of this origin (Web Locks API), so only
 * one refresh is in flight at a time across tabs.
 *
 * Why it matters: every refresh rotates the `refresh_token` cookie, and the backend treats a
 * rotated token presented again as a possible theft. Two tabs refreshing at once would send
 * the same cookie twice. Serialised, the second tab gets the lock after the first one's
 * response has already replaced the cookie, so it sends the new value. Within a few seconds
 * the backend answers a duplicate with 409 rather than revoking (see `AuthService.refresh`,
 * which retries it); the lock keeps that the exception.
 *
 * Browsers without Web Locks (very old ones) run the task directly.
 */
export function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks as LockManager | undefined;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}
