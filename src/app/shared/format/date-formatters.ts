/**
 * Canonical date / date-time formatters for the whole app.
 *
 * <h3>Why a shared module</h3>
 *
 * Before this lived in one place every feature shipped its own variant —
 * {@code formatInstant} in audit, {@code formatDateTime} in funerals + incomes,
 * {@code formatIsoToLocaleDate} in affiliates, an ad-hoc cell helper in the
 * item dialog. The outputs disagreed on tiny but visible details (dash vs
 * slash separator, padded vs un-padded digits, locale-aware comma vs space
 * between date and time), so the same {@code incomeDate} value rendered three
 * different ways across the UI. Centralising the conversion in one module
 * enforces a single canonical format.
 *
 * <h3>Canonical formats</h3>
 *
 * <ul>
 *   <li><b>Date</b> — {@code dd/MM/yyyy}.</li>
 *   <li><b>Date + time</b> — {@code dd/MM/yyyy HH:mm} (24-hour, space
 *       separator, no comma, no seconds).</li>
 *   <li><b>Date + time + seconds</b> — {@code dd/MM/yyyy HH:mm:ss}, audit only.</li>
 * </ul>
 *
 * <h3>Always-Argentina display timezone</h3>
 *
 * The funeral home runs out of Buenos Aires; every operator expects to see
 * Argentine local time regardless of where the browser actually is. We pin
 * the display zone explicitly via {@link Intl.DateTimeFormat} with
 * {@code timeZone: 'America/Argentina/Buenos_Aires'} when the input carries
 * timezone information (ISO 8601 with {@code Z} or numeric offset). This
 * also makes the unit tests deterministic — they pass identically on a
 * developer's Argentina machine and on a CI runner that defaults to UTC.
 *
 * <h3>Input tolerance</h3>
 *
 * Both helpers accept several wire shapes so the UI keeps working through
 * the LocalDateTime → Instant migration the backend is rolling out:
 *
 * <ul>
 *   <li>ISO 8601 with trailing {@code Z} ({@code 2025-09-26T17:30:00Z}) —
 *       canonical, parsed via {@code Date} and converted to AR zone.</li>
 *   <li>ISO 8601 with numeric offset ({@code 2025-09-26T17:30-03:00}) —
 *       same handling as the {@code Z} form.</li>
 *   <li>ISO 8601 naive ({@code 2025-09-26T17:30}) — treated as wall-clock
 *       already in the operator's timezone; fields are rearranged without
 *       any conversion.</li>
 *   <li>ISO date only ({@code 2025-09-26}) — calendar date, no
 *       conversion.</li>
 *   <li>Legacy {@code dd-MM-yyyy HH:mm} — what some endpoints still ship
 *       until the Instant refactor lands everywhere. Just rearranged.</li>
 *   <li>Legacy {@code dd-MM-yyyy} — date-only legacy. Just rearranged.</li>
 * </ul>
 *
 * Anything that cannot be parsed comes back as the raw input string so the
 * operator at least sees the underlying value during diagnosis instead of
 * an empty cell.
 */

const TZ_ARGENTINA = 'America/Argentina/Buenos_Aires';

/** Returns `dd/MM/yyyy` in Argentina local time. */
export function formatDate(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const fields = parseToFields(input);
  if (fields === null) {
    return input;
  }
  return `${fields.day}/${fields.month}/${fields.year}`;
}

/** Returns `dd/MM/yyyy HH:mm` in Argentina local time. */
export function formatDateTime(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const fields = parseToFields(input);
  if (fields === null) {
    return input;
  }
  return `${fields.day}/${fields.month}/${fields.year} ${fields.hour}:${fields.minute}`;
}

/**
 * Returns `dd/MM/yyyy HH:mm:ss` — adds seconds to the canonical
 * {@link formatDateTime}. Only used by audit-event surfaces where sub-minute
 * precision matters for forensic correlation across logs (two events in the
 * same minute would otherwise look identical to the operator).
 */
export function formatDateTimeWithSeconds(input: string | null | undefined): string {
  if (input === null || input === undefined || input === '') {
    return '—';
  }
  const fields = parseToFields(input);
  if (fields === null) {
    return input;
  }
  return (
    `${fields.day}/${fields.month}/${fields.year} ` +
    `${fields.hour}:${fields.minute}:${fields.second}`
  );
}

/**
 * Padded calendar + clock fields. Strings (not numbers) because the
 * downstream concatenation only ever pastes them into a template — keeping
 * them strings avoids re-padding at every call site.
 */
interface DateFields {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
  readonly second: string;
}

function parseToFields(input: string): DateFields | null {
  // ISO date-only (`yyyy-MM-dd`) — calendar date, no zone conversion.
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly;
    return { year, month, day, hour: '00', minute: '00', second: '00' };
  }
  // ISO datetime with timezone marker (Z or numeric offset) — parse + convert.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(input)) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return extractArgentinaFields(date);
  }
  // ISO datetime naive (no zone) — already in display zone, just rearrange.
  const naive = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    return { year, month, day, hour, minute, second: second ?? '00' };
  }
  // Legacy `dd-MM-yyyy HH:mm` and `dd-MM-yyyy`.
  const legacy = /^(\d{2})-(\d{2})-(\d{4})(?:[\sT](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(input);
  if (legacy) {
    const [, day, month, year, hour, minute, second] = legacy;
    return {
      year,
      month,
      day,
      hour: hour ?? '00',
      minute: minute ?? '00',
      second: second ?? '00',
    };
  }
  return null;
}

/**
 * Extracts padded year / month / day / hour / minute / second from a
 * {@link Date}, formatted in the Argentina display timezone via
 * {@link Intl.DateTimeFormat#formatToParts}. The {@code en-CA} locale is
 * chosen because its part shapes are stable across V8 versions (always
 * 2-digit numerics with no thousand-separators in the year).
 *
 * <p>{@code formatToParts} occasionally emits {@code "24"} for the
 * midnight hour on some V8 builds — we normalise that to {@code "00"} so
 * the operator never sees an out-of-range clock reading.
 */
function extractArgentinaFields(date: Date): DateFields {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TZ_ARGENTINA,
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes, fallback: string): string =>
    parts.find((p) => p.type === type)?.value ?? fallback;
  const rawHour = partValue('hour', '00');
  return {
    year: partValue('year', '0000'),
    month: partValue('month', '00'),
    day: partValue('day', '00'),
    hour: rawHour === '24' ? '00' : rawHour,
    minute: partValue('minute', '00'),
    second: partValue('second', '00'),
  };
}
