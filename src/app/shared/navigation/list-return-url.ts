/**
 * Small helper to preserve a list page's filter / sort / pagination state
 * when the operator drills into a detail or edit form and then walks back
 * — either via the back arrow, via the "Cancelar" button, or by saving the
 * form. Without it, the back navigation lands on the bare `/servicios`
 * URL and the operator loses every filter they had applied.
 *
 * <h3>Why `history.state` and not a service</h3>
 *
 * A `Router.navigate({ state: ... })` payload rides along with the
 * `popstate` entry the browser pushes, so it survives:
 *
 * <ul>
 *   <li>back/forward navigation (the natural test case);</li>
 *   <li>a hard refresh of the detail page (state is dropped on reload —
 *       we fall back to the bare listing URL on purpose);</li>
 *   <li>a deep-link e-mailed by a colleague (no state, falls back).</li>
 * </ul>
 *
 * A service-backed approach would survive deep-links too, but at the
 * cost of leaking stale return URLs across unrelated navigations
 * (operator opens `/servicios/12` in a new tab from somewhere, expects
 * the back arrow to take them to that other place, not to the listing
 * they last filtered three hours ago). The `history.state` payload is
 * scoped to the specific navigation entry, which is exactly the
 * semantic we want.
 *
 * <h3>Contract</h3>
 *
 * The state payload carries a single string under the {@link STATE_KEY}
 * key. Callers serialise the full URL (including the query string) so
 * the return navigation restores the exact filter set verbatim.
 *
 * @see funeral-list.page.ts for the canonical sender.
 * @see funeral-detail.page.ts / funeral-form.page.ts for the canonical receiver.
 */
export const STATE_KEY = 'listReturnUrl' as const;

/**
 * Reads the list return URL stashed on the current `history.state`. Returns
 * the {@code fallback} when no payload is present (deep-link / fresh tab /
 * the operator landed via the sidebar). The fallback should always be the
 * feature's bare list URL so the back navigation still lands somewhere
 * sensible.
 */
export function readListReturnUrl(fallback: string): string {
  const state = (typeof history !== 'undefined' ? history.state : null) as
    | Record<string, unknown>
    | null;
  const value = state ? state[STATE_KEY] : undefined;
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Builds the `state` argument for `Router.navigate({ ..., state })` that the
 * receiving page will recognise. Callers pass the full URL they want the
 * receiver to bounce back to (typically `this.router.url`).
 */
export function withListReturnUrl(returnUrl: string): Record<string, string> {
  return { [STATE_KEY]: returnUrl };
}
