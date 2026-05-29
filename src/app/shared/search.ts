/**
 * Normalises a string for diacritic + case-insensitive search comparisons.
 *
 * <p>Pipeline:
 * <ol>
 *   <li>{@code normalize('NFD')} splits each precomposed accented character
 *       into its base letter + a combining diacritic codepoint (e.g.
 *       "í" → "i" + U+0301).</li>
 *   <li>The combining range U+0300..U+036F is stripped, leaving only the
 *       base letters.</li>
 *   <li>{@code toLocaleLowerCase()} lower-cases the result.</li>
 * </ol>
 *
 * <p>"Tío" → "tio", "Acuña" → "acuna", "Pérez" → "perez". Pass both the needle
 * and the haystack through this helper so the {@code includes} check stays
 * symmetric — this is how operators expect Spanish search to behave; without
 * it any column-header filter or in-form autocomplete will reject perfectly
 * sensible queries just because the user did not type the diacritic.
 *
 * <p>Used by:
 * <ul>
 *   <li>{@code DataTableComponent.filteredAutocompleteOptions} — column-
 *       header autocomplete filter (eg. Parentesco "tio" → "Tío").</li>
 *   <li>In-form autocomplete pickers — eg. the Item selector on the plan
 *       form (see CLAUDE.md "Autocomplete pickers in forms" convention).</li>
 * </ul>
 */
export function normaliseForSearch(input: string): string {
  // The character class `̀-ͯ` is the Unicode "Combining Diacritical Marks"
  // block — after NFD decomposition every accent becomes one of these
  // codepoints, so a single regex sweep removes the whole family in one pass.
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

/**
 * Minimum number of characters before an autocomplete picker should start
 * suggesting matches.
 *
 * <p>Three is the project-wide convention — short enough that the operator
 * doesn't have to type a full word, long enough that a one-letter probe
 * doesn't dump the full catalog on screen (and, on backend-driven pickers,
 * doesn't fire a request for every keystroke). Backend-driven pickers should
 * also debounce the input by {@link AUTOCOMPLETE_DEBOUNCE_MS} so a fast typer
 * gets a single request when they pause, not one per keystroke. See the
 * "Autocomplete pickers in forms" rule in CLAUDE.md.
 */
export const AUTOCOMPLETE_MIN_CHARS = 3 as const;

/**
 * Debounce window (in ms) for backend-driven autocomplete pickers. Local
 * (in-memory) pickers can skip the debounce because the filter is
 * synchronous — the constant still applies to keep the perceived behaviour
 * (typed → brief settle → suggestions) consistent across pickers.
 */
export const AUTOCOMPLETE_DEBOUNCE_MS = 300 as const;
