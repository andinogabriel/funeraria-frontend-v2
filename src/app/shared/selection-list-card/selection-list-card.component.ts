import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DataTableComponent, type DataTableColumn, type DataTableSort } from '../data-table';
import type { ListCardAction } from './selection-list-card.types';

/**
 * Re-usable list-page card. Encapsulates the pattern that has shipped on every
 * CRUD surface so far (affiliates, plans, soon funerals): a `mat-card` with a
 * toolbar row (search field with X clear affordance + action buttons split
 * between an icon-only mobile presentation and a labelled desktop one) on top
 * of a {@link DataTableComponent} in client-side mode, with the canonical
 * loading / empty / has-data branches sharing a fixed 632 px footprint so the
 * card never visibly resizes between states.
 *
 * <h3>What the parent owns</h3>
 *
 * - The search `FormControl<string>` — keeps debouncing semantics open. The
 *   parent typically pipes `valueChanges` into a signal that feeds the
 *   `filteredData` computed it then passes through `[data]`.
 * - The action list and their handlers — declarative array (no
 *   `<ng-content>` slot) because every concrete page so far has the same
 *   shape (icon, label, tooltip, disabled, handler) and the data-driven
 *   form is easier to read at the call site.
 * - The selection — two-way bound through `[(selectedRow)]` so the parent
 *   can drive disabled state on the actions and clear it on delete.
 * - The empty-state copy — every page has a slightly different message.
 *
 * <h3>What this component owns</h3>
 *
 * - The card's mobile scroll container (`max-h` + `overflow-y-auto`) and
 *   the sticky-bottom paginator inside the data-table.
 * - The mobile vs desktop button styling (icon-button vs stroked-button).
 * - The min-height of the table area so loading / empty / table states
 *   share the same vertical footprint.
 */
@Component({
  selector: 'app-selection-list-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  templateUrl: './selection-list-card.component.html',
  styleUrl: './selection-list-card.component.scss',
})
export class SelectionListCardComponent<T> {
  /** Reactive form control for the search field. Parent listens to its valueChanges. */
  readonly searchControl = input.required<FormControl<string>>();

  /** Material label shown inside the search field. */
  readonly searchLabel = input<string>('Buscar');

  /** Rows to render — already filtered by the parent. */
  readonly data = input.required<readonly T[]>();

  /** Column definitions forwarded to the inner DataTable. */
  readonly columns = input.required<readonly DataTableColumn<T>[]>();

  /** Track-by accessor forwarded to the inner DataTable. */
  readonly trackBy = input<(index: number, row: T) => unknown>((_, row) => row);

  /** Persistence key for the inner DataTable's user preferences. */
  readonly storageKey = input<string | undefined>(undefined);

  /** Initial sort applied before any persisted preference. */
  readonly initialSort = input<DataTableSort | null>(null);

  /** True while data is still being fetched on the first call. */
  readonly loading = input<boolean>(false);

  /** Copy + iconography for the empty-state branch. */
  readonly emptyIcon = input<string>('search_off');
  readonly emptyTitle = input<string>('No hay resultados.');
  readonly emptyHint = input<string>('Probá con otro criterio de búsqueda.');

  /** Toolbar action descriptors. Rendered in two presentations (mobile / desktop). */
  readonly actions = input<readonly ListCardAction[]>([]);

  /** Two-way bound currently-selected row. */
  readonly selectedRow = model<T | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  /**
   * Signal-backed mirror of the search input's value. We can't `computed()` straight
   * off `searchControl().value` because that read is a plain FormControl getter and
   * Angular's signal graph does not track it — the X clear button silently froze in
   * its initial state. Instead, an effect subscribes to whichever FormControl the
   * parent currently provides and pushes value updates into this signal. The effect
   * re-runs if the parent ever swaps the FormControl reference; the inner
   * subscription is cleaned up through `DestroyRef.onDestroy` so we never leak.
   */
  private readonly searchValue = signal('');

  /**
   * Whether the search field currently holds a query. Drives the X clear
   * affordance's visibility through a properly signal-backed read so the button
   * shows/hides synchronously with each keystroke.
   */
  protected readonly hasSearchValue = computed(() => this.searchValue().length > 0);

  constructor() {
    effect(() => {
      const control = this.searchControl();
      // Seed the signal with the current value so the X stays consistent across
      // FormControl swaps (e.g. parent re-creates the control after a reset).
      this.searchValue.set(control.value ?? '');
      const subscription = control.valueChanges.subscribe((value) => {
        this.searchValue.set(value ?? '');
      });
      this.destroyRef.onDestroy(() => subscription.unsubscribe());
    });
  }

  /** Convenience method for the clear button — also flips the field back to focusable. */
  protected onClearSearch(): void {
    this.searchControl().setValue('');
  }
}
