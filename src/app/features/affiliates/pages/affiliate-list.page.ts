import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { DataTableComponent, type DataTableColumn } from '../../../shared/data-table';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate } from '../affiliate.types';

/**
 * Lists active affiliates with client-side filtering, sorting, paging and a column
 * chooser. The page owns the search input (the UX is page-specific) and delegates
 * rendering, sort and pagination to {@link DataTableComponent}.
 *
 * Sort, visible columns and page size are persisted via the table's `storageKey`
 * (`affiliates.list`) so a user that prefers, say, hiding "Género" and sorting by
 * "Apellido asc" sees that exact layout next time they open the page — even across
 * sessions on the same browser.
 *
 * Server-side mode is reserved for PR-C; the active list is small enough that
 * client-side sort+filter is the right trade-off today.
 */
@Component({
  selector: 'app-affiliate-list-page',
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
    RouterLink,
  ],
  templateUrl: './affiliate-list.page.html',
  styleUrl: './affiliate-list.page.scss',
})
export class AffiliateListPage {
  private readonly service = inject(AffiliateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly search = new FormControl('', { nonNullable: true });

  /**
   * Reactive snapshot of the search input. A signal mirroring `valueChanges` keeps
   * the bridging code explicit when the next contributor reads it.
   */
  private readonly searchTerm = signal('');

  /**
   * Filtered view over the cached list. The data table consumes this signal directly;
   * sort + paging are applied internally by the component.
   */
  protected readonly filtered = computed<readonly Affiliate[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter(
      (affiliate) =>
        affiliate.firstName.toLowerCase().includes(term) ||
        affiliate.lastName.toLowerCase().includes(term) ||
        String(affiliate.dni).includes(term),
    );
  });

  /**
   * Column descriptors for {@link DataTableComponent}. The DNI column is non-hideable
   * because it's the natural key of the row — losing it would leave users without a
   * stable identifier to act on. Actions are projected through the `#actions` template.
   */
  protected readonly columns: readonly DataTableColumn<Affiliate>[] = [
    {
      key: 'dni',
      label: 'DNI',
      value: (a) => a.dni,
      cellClass: 'font-mono tabular-nums',
      hideable: false,
    },
    {
      key: 'lastName',
      label: 'Apellido',
      value: (a) => a.lastName,
    },
    {
      key: 'firstName',
      label: 'Nombre',
      value: (a) => a.firstName,
    },
    {
      key: 'birthDate',
      label: 'Nacimiento',
      value: (a) => a.birthDate,
      cellClass: 'tabular-nums',
    },
    {
      key: 'relationship',
      label: 'Parentesco',
      value: (a) => a.relationship.name,
    },
    {
      key: 'gender',
      label: 'Género',
      value: (a) => a.gender.name,
      defaultVisible: false,
    },
  ] as const;

  /** Stable row identity for MatTable's trackBy — DNI is the affiliate's natural key. */
  protected readonly trackByDni = (_: number, row: Affiliate): number => row.dni;

  constructor() {
    // Initial load is fire-and-forget — the service signals drive the template.
    this.service.loadActive().subscribe();

    this.search.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe((value) => {
      this.searchTerm.set(value);
    });
  }

  /** Triggered from the row's trailing delete button. */
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
