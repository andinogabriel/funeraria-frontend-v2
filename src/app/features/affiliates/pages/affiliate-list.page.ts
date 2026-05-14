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
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { DataTableComponent, type DataTableColumn } from '../../../shared/data-table';
import { AffiliateDetailDialogComponent } from '../components/affiliate-detail-dialog.component';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate } from '../affiliate.types';

/**
 * Lists active affiliates with client-side filtering, sorting and paging.
 *
 * <h3>Selection-driven actions</h3>
 *
 * The grid is selectable (single row). The toolbar exposes "Detalle", "Editar"
 * and "Eliminar" buttons; they stay disabled until the user picks a row. This
 * replaces the per-row action column from the previous iteration — it keeps the
 * grid clean, avoids accidental clicks on inline icons inside a dense row, and
 * gives the actions enough room to carry text labels alongside their icons.
 *
 * The detail dialog ({@link AffiliateDetailDialogComponent}) surfaces fields
 * that do not earn space in the list table (gender, alta, deceased flag,
 * computed age). Edit still routes through the dedicated form page so the
 * stepper + validation path stays canonical.
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
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly search = new FormControl('', { nonNullable: true });

  /**
   * Reactive snapshot of the search input. A signal mirroring `valueChanges` keeps
   * the bridging code explicit when the next contributor reads it.
   */
  private readonly searchTerm = signal('');

  /**
   * Currently selected row, two-way bound with the data-table. Drives the enabled
   * state of the Detalle / Editar / Eliminar toolbar buttons.
   */
  protected readonly selectedAffiliate = signal<Affiliate | null>(null);

  /** Convenience flag the template reads to disable the action buttons. */
  protected readonly hasSelection = computed(() => this.selectedAffiliate() !== null);

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
   * stable identifier to act on. No per-row action column any more: actions live in
   * the page toolbar and operate on the currently-selected row.
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

  /** Opens the read-only detail modal for the currently-selected affiliate. */
  protected onShowDetail(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    this.dialog.open(AffiliateDetailDialogComponent, {
      data: affiliate,
      width: '480px',
      maxWidth: '95vw',
    });
  }

  /** Navigates to the edit form for the currently-selected affiliate. */
  protected onEdit(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    void this.router.navigate(['/afiliados', affiliate.dni, 'editar']);
  }

  /**
   * Confirms then deletes the currently-selected affiliate. On success the
   * selection is cleared so the toolbar buttons disable again — leaving the
   * selection around after the underlying row vanishes would let the user
   * trigger actions on a stale object.
   */
  protected onDelete(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
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
        next: () => {
          this.selectedAffiliate.set(null);
          this.snackBar.open('Afiliado eliminado', 'OK', { duration: 3000 });
        },
        error: () =>
          this.snackBar.open('No se pudo eliminar el afiliado', 'OK', { duration: 5000 }),
      });
    });
  }

  /** Manual refresh action exposed on the header; also clears any prior selection. */
  protected onRefresh(): void {
    this.selectedAffiliate.set(null);
    this.service.loadActive().subscribe();
  }
}
