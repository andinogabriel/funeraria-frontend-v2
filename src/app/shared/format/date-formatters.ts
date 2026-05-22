/**
 * Canonical date / date-time formatters for the whole app.
 *
 * <h3>Why a shared module</h3>
 *
 * Before this lived in one place every feature shipped its own variant —
 * `formatInstant` in audit, `formatDateTime` in funerals + incomes,
 * `formatIsoToLocaleDate` in affiliates, an ad-hoc cell helper in item
 * dialog. The outputs disagreed on tiny but visible details (dash vs slash
 * separator, padded vs un-padded digits, locale-aware comma vs space between
 * date and time), so the same `incomeDate` value rendered three different
 * ways across the UI. Centralising the conversion in one module enforces a
 * single canonical format and makes localisation (e.g. switching to a
 * different country tenant later) a one-line change.
 *
 * <h3>Canonical formats</h3>
 *
 * <ul>
 *   <li><b>Date</b> — {@code dd/MM/yyyy} (Argentine convention).</li>
 *   <li><b>Date + time</b> — {@code dd/MM/yyyy HH:mm} (24-hour clock,
 *       space between date and time, no comma, no seconds).</li>
 * </ul>
 *
 * <h3>Input tolerance</h3>
 *
 * Both helpers accept several wire shapes so the UI keeps working through
 * the LocalDateTime → Instant migration the backend is rolling out:
 *
 * <ul>
 *   <li>ISO 8601 with trailing {@code Z} ({@code 2025-09-26T17:30:00Z}) —
 *       canonical, what new backend endpoints emit.</li>
 *   <li>ISO 8601 naive ({@code 2025-09-26T17:30}) — older surfaces.</li>
 *   <li>ISO date only ({@code 2025-09-26}) — affiliate birth date.</li>
 *   <li>Legacy {@code dd-MM-yyyy HH:mm} — what some endpoints still ship
 *       until the Instant refactor lands across the board.</li>
 *   <li>Legacy {@code dd-MM-yyyy} — date-only legacy.</li>
 * </ul>
 *
 * Anything that cannot be parsed comes back as the raw input string, so the
 * operator at least sees the underlying value during diagnosis instead of
 * an empty cell.
 *
 * <h3>Timezone semantics</h3>
 *
 * Parsing uses {@link Date}, which honours a trailing {@code Z} and converts
 * to the browser's local timezone for the subsequent {@code getDate} /
 * {@code getHours} reads. Naive ISO and legacy strings are parsed without
 * timezone information, which is exactly what those producers intended.
 */

/** Returns `dd/MM/yyyy` in the operator's local timezone. */
export function formatDate(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const date = parseFlexible(input);
  if (date === null) {
    return input;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Returns `dd/MM/yyyy HH:mm` in the operator's local timezone. */
export function formatDateTime(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const date = parseFlexible(input);
  if (date === null) {
    return input;
  }
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Returns `dd/MM/yyyy HH:mm:ss` — adds seconds to the canonical {@link formatDateTime}.
 * Only used by audit-event surfaces where sub-minute precision matters for
 * forensic correlation across logs (two events in the same minute would
 * otherwise look identical to the operator).
 */
export function formatDateTimeWithSeconds(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const date = parseFlexible(input);
  if (date === null) {
    return input;
  }
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Tries every shape we accept on the way in. Returns `null` when the input
 * cannot be parsed — callers surface the raw string in that case so a
 * malformed payload remains visible.
 */
function parseFlexible(input: string): Date | null {
  // ISO date-only (`yyyy-MM-dd`). Parse as a local-zone calendar date instead
  // of the Date constructor's default of UTC midnight, otherwise an
  // Argentina user sees the previous calendar day (UTC-3 means 2025-09-26 UTC
  // midnight reads as 2025-09-25 23:00 local).
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // ISO 8601 with `Z` or full ISO with offset: the Date constructor handles
  // these directly and timezone-correctly. We also accept the naive ISO
  // (no Z), which Date treats as local time — what every legacy producer
  // assumed anyway.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(input)) {
    const direct = new Date(input);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }
  // Legacy `dd-MM-yyyy HH:mm` and `dd-MM-yyyy`. Parse manually because
  // `new Date('24-11-2025')` is either invalid or interpreted as a different
  // month/day order depending on the browser — the only safe path is to
  // pull the fields out ourselves and feed `Date(year, month-1, day, ...)`.
  const legacyDateTime = /^(\d{2})-(\d{2})-(\d{4})(?:[\sT](\d{2}):(\d{2}))?$/.exec(input);
  if (legacyDateTime) {
    const [, day, month, year, hour, minute] = legacyDateTime;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
