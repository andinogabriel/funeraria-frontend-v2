import { formatDate, formatDateTime, formatDateTimeWithSeconds } from './date-formatters';

/**
 * The display formatters depend on the browser's local timezone. Vitest runs in
 * Node with whatever `process.env.TZ` is set to; if we let it default to UTC,
 * an ISO 8601 with a trailing `Z` would render with the UTC wall-clock and the
 * test could no longer pin the Argentina-specific behaviour we ship to users.
 * Setting `TZ` before the suite spins up forces a deterministic frame of
 * reference; the `vi.stubGlobal` trick from vitest is overkill here.
 */
beforeAll(() => {
  process.env.TZ = 'America/Argentina/Buenos_Aires';
});

describe('formatDate', () => {
  it('renders an ISO date as dd/MM/yyyy', () => {
    expect(formatDate('2025-09-26')).toBe('26/09/2025');
  });

  it('renders an ISO instant in the operator local timezone (Argentina, UTC-3)', () => {
    // 2025-09-26T02:00Z is 23:00 on the 25th in Buenos Aires.
    expect(formatDate('2025-09-26T02:00:00Z')).toBe('25/09/2025');
  });

  it('accepts the legacy dd-MM-yyyy payload some endpoints still ship', () => {
    expect(formatDate('26-09-2025')).toBe('26/09/2025');
  });

  it('returns an em dash when the input is empty / null / undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('returns the raw input when the value cannot be parsed', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('formatDateTime', () => {
  it('renders an ISO instant as dd/MM/yyyy HH:mm in the local timezone', () => {
    // 2025-09-26T17:30Z is 14:30 in Buenos Aires.
    expect(formatDateTime('2025-09-26T17:30:00Z')).toBe('26/09/2025 14:30');
  });

  it('renders a naive ISO datetime as-is (treated as local time)', () => {
    expect(formatDateTime('2025-09-26T14:30')).toBe('26/09/2025 14:30');
  });

  it('accepts the legacy dd-MM-yyyy HH:mm payload', () => {
    expect(formatDateTime('26-09-2025 14:30')).toBe('26/09/2025 14:30');
  });

  it('accepts the legacy dd-MM-yyyy payload (no time) and pads to 00:00', () => {
    expect(formatDateTime('26-09-2025')).toBe('26/09/2025 00:00');
  });

  it('returns an em dash when the input is empty / null', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });

  it('returns the raw input when the value cannot be parsed', () => {
    expect(formatDateTime('garbage')).toBe('garbage');
  });
});

describe('formatDateTimeWithSeconds', () => {
  it('adds seconds to the canonical format for audit-event timestamps', () => {
    expect(formatDateTimeWithSeconds('2025-09-26T17:30:42Z')).toBe('26/09/2025 14:30:42');
  });

  it('pads seconds to 00 when the input has no sub-minute component', () => {
    expect(formatDateTimeWithSeconds('2025-09-26T14:30')).toBe('26/09/2025 14:30:00');
  });

  it('falls back to the raw input on unparseable values', () => {
    expect(formatDateTimeWithSeconds('garbage')).toBe('garbage');
  });
});
