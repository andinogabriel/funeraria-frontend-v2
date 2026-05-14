/**
 * Toolbar action descriptor for {@link SelectionListCardComponent}. Modeled as a
 * data type (no template projection) because every concrete page so far ends up
 * with the exact same shape: an icon, a label that hides under `sm:`, a tooltip
 * for accessibility, a disabled flag that tracks selection, and a click handler.
 *
 * The `kind` field controls the colour of the button — `warn` for destructive
 * actions, `primary` for the dominant call to action, `default` for everything
 * else. Anything more bespoke (custom badges, loaders) earns a proper
 * `<ng-template>` slot — see the file Javadoc on the component.
 */
export interface ListCardAction {
  /** Stable id used as the `track` key and the `(actionClick)` event payload. */
  readonly id: string;

  /** Material Symbols Outlined icon name (e.g. `edit`, `delete`, `visibility`). */
  readonly icon: string;

  /** Text label shown alongside the icon on `sm+`. Hidden on mobile. */
  readonly label: string;

  /** Tooltip + aria-label. Falls back to `label` when not provided. */
  readonly tooltip?: string;

  /** Visual emphasis. `warn` for destructive, otherwise the default outlined look. */
  readonly kind?: 'default' | 'warn';

  /** Whether the action should be disabled. Recompute reactively at the call site. */
  readonly disabled: boolean;

  /** Click handler invoked after the user activates the button. */
  readonly handler: () => void;
}
