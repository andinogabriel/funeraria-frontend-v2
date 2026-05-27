import { readListReturnUrl, STATE_KEY, withListReturnUrl } from './list-return-url';

describe('list-return-url helper', () => {
  // The helper reads from the global `history.state` (the same payload Angular
  // attaches when a caller does `router.navigate(..., { state })`). We exercise
  // it directly by pushing a synthetic state — same shape Angular would build —
  // and asserting both the happy path and the deep-link / fresh-tab fallbacks.

  beforeEach(() => {
    // Wipe any state left from a previous test so the helper does not pick
    // up cross-test bleed-through.
    history.replaceState(null, '', window.location.href);
  });

  afterEach(() => {
    history.replaceState(null, '', window.location.href);
  });

  describe('withListReturnUrl', () => {
    it('builds a state payload under the well-known key the reader looks up', () => {
      const state = withListReturnUrl('/servicios?planName=premium&page=0&size=25');

      expect(state).toEqual({ [STATE_KEY]: '/servicios?planName=premium&page=0&size=25' });
    });

    it('uses the same constant the reader keys off, so the contract cannot drift', () => {
      const state = withListReturnUrl('/x');

      // Locking the key in a test guards against a silent rename: a future
      // refactor that only touches one side would surface as a failing
      // round-trip assertion here.
      const roundTripped = state[STATE_KEY];
      expect(roundTripped).toBe('/x');
    });
  });

  describe('readListReturnUrl', () => {
    it('returns the URL stashed on history.state when present', () => {
      history.replaceState({ [STATE_KEY]: '/afiliados?dni=12345' }, '');

      expect(readListReturnUrl('/afiliados')).toBe('/afiliados?dni=12345');
    });

    it('falls back to the supplied default when history.state is empty (deep-link)', () => {
      history.replaceState(null, '');

      expect(readListReturnUrl('/servicios')).toBe('/servicios');
    });

    it('falls back when history.state carries an unrelated payload', () => {
      // Angular's Router itself sometimes stashes `{ navigationId: N }` on
      // state; the helper must ignore anything it does not own.
      history.replaceState({ navigationId: 42 }, '');

      expect(readListReturnUrl('/items')).toBe('/items');
    });

    it('falls back when the stashed value is not a string', () => {
      // Defensive: a stale or corrupted state should not crash the back arrow.
      history.replaceState({ [STATE_KEY]: 42 }, '');

      expect(readListReturnUrl('/ingresos')).toBe('/ingresos');
    });

    it('falls back when the stashed value is the empty string', () => {
      // An empty string would resolve to the current URL when handed to
      // `navigateByUrl` and silently swallow the operator's click — treat
      // it as "no return URL" instead.
      history.replaceState({ [STATE_KEY]: '' }, '');

      expect(readListReturnUrl('/items')).toBe('/items');
    });
  });

  it('round-trips a URL through withListReturnUrl + readListReturnUrl', () => {
    const url = '/servicios?planName=premium&from=2025-01-01&to=2025-12-31&page=2&size=50';
    history.replaceState(withListReturnUrl(url), '');

    expect(readListReturnUrl('/servicios')).toBe(url);
  });
});
