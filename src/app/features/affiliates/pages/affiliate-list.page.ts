import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate } from '../affiliate.types';

/**
 * Lists active affiliates with client-side filtering and pagination. The service caches
 * the active list, so re-entering the page is instantaneous; we only refetch the first
 * time the component mounts after a logout/login cycle or after a write.
 *
 * Filter strategy: client-side. The active list is small (sub-thousand) and showing
 * results without a network round-trip feels snappier on every keystroke. If the list
 * grows past the comfort zone, switch the filter form to call
 * {@link AffiliateService#search} with `debounceTime` and render the server response.
 *
 * Sorting: column headers do not sort yet. Add `MatSort` when a real user request comes
 * in — premature for a list with a handful of entries.
 */
@Component({
  selector: 'app-affiliate-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './affiliate-list.page.html',
  styleUrl: './affiliate-list.page.scss',
})
export class AffiliateListPage implements AfterViewInit {
  private readonly service = inject(AffiliateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Columns rendered by the MatTable, left-to-right. */
  protected readonly displayedColumns = [
    'dni',
    'lastName',
    'firstName',
    'birthDate',
    'relationship',
    'gender',
    'actions',
  ] as const;

  @ViewChild(MatPaginator) protected paginator?: MatPaginator;

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly search = new FormControl('', { nonNullable: true });

  /**
   * Reactive snapshot of the search input. `toSignal` would also work but a plain
   * signal mirroring the form control via `valueChanges` keeps the bridging code
   * explicit when the next contributor reads it.
   */
  private readonly searchTerm = signal('');

  /**
   * Filtered + lower-cased view over the cached list. Reads the service's `list`
   * signal directly so every write through `loadActive` / `create` / `update` /
   * `delete` re-runs the filter without explicit subscription management.
   */
  protected readonly filtered = computed<readonly Affiliate[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter((affiliate) => {
      return (
        affiliate.firstName.toLowerCase().includes(term) ||
        affiliate.lastName.toLowerCase().includes(term) ||
        String(affiliate.dni).includes(term)
      );
    });
  });

  /**
   * Paginated slice of `filtered`, in the order the MatTable consumes. Reads the
   * paginator state through `paginatorIndex` / `paginatorSize` signals fed from the
   * paginator's outputs in {@link ngAfterViewInit}.
   */
  protected readonly paginated = computed<readonly Affiliate[]>(() => {
    const data = this.filtered();
    const start = this.pageIndex() * this.pageSize();
    return data.slice(start, start + this.pageSize());
  });

  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  constructor() {
    // Initial load is fire-and-forget — the service signals drive the template.
    this.service.loadActive().subscribe();

    // Bridge the search FormControl into a signal with a small debounce so the table
    // does not re-filter on every keystroke. `takeUntilDestroyed` ties the subscription
    // to the component's destroy hook without an explicit `OnDestroy` implementation.
    this.search.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe((value) => {
      this.searchTerm.set(value);
      this.pageIndex.set(0);
    });

    // Reset the paginator page to 0 whenever the filtered set shrinks below the
    // current offset (otherwise the user sees an empty page after deleting the last
    // row of the current slice).
    effect(() => {
      const size = this.filtered().length;
      if (this.pageIndex() * this.pageSize() >= size && size > 0) {
        this.pageIndex.set(Math.max(0, Math.ceil(size / this.pageSize()) - 1));
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.paginator) {
      return;
    }
    this.paginator.page.subscribe((event) => {
      this.pageIndex.set(event.pageIndex);
      this.pageSize.set(event.pageSize);
    });
  }

  /** Triggered from the row's trailing delete button. Opens the confirm dialog. */
  protected onDelete(affiliate: Affiliate): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar afiliado',
        message: `¿Estás seguro de querer eliminar a ${affiliate.firstName} ${affiliate.lastName} (DNI ${affiliate.dni})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      this.service.delete(affiliate.dni).subscribe({
        next: () => this.snackBar.open('Afiliado eliminado', 'OK', { duration: 3000 }),
        error: () =>
          this.snackBar.open('No se pudo eliminar el afiliado', 'OK', { duration: 5000 }),
      });
    });
  }

  /** Manual refresh action exposed on the toolbar; clears any prior error. */
  protected onRefresh(): void {
    this.service.loadActive().subscribe();
  }
}
