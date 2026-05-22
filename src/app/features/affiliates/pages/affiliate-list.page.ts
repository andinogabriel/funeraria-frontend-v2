import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { AffiliateDetailDialogComponent } from '../components/affiliate-detail-dialog.component';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate } from '../affiliate.types';

/**
 * Lists active affiliates with client-side filtering, sorting and paging.
 *
 * Most of the visual machinery (search field with X clear, action buttons row
 * with mobile/desktop variants, selection-driven highlight, sticky paginator,
 * shared 632 px footprint) lives inside
 * {@link SelectionListCardComponent}. This page only owns:
 *
 * - The cached affiliate list signal it pulls from the service.
 * - The local search term mirror + filtered computed that feeds the card's
 *   `data` input.
 * - The selection signal it two-way binds to the card, plus the effect that
 *   clears it when the picked row falls out of the filtered view.
 * - The action handlers (`Detalle` opens the modal, `Editar` routes, `Eliminar`
 *   confirms + deletes) wired through the declarative `actions` array.
 */
@Component({
  selector: 'app-affiliate-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
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

  /** Unfiltered rows passed to the shared card; the wrapper handles per-column filtering. */
  protected readonly rows = computed<readonly Affiliate[]>(() => this.service.list() ?? []);

  /** Currently selected row, two-way bound with the shared card. */
  protected readonly selectedAffiliate = signal<Affiliate | null>(null);

  /** Convenience flag the actions array reads to compute disabled state. */
  protected readonly hasSelection = computed(() => this.selectedAffiliate() !== null);

  /** Column descriptors for the data table inside the shared card. */
  protected readonly columns: readonly DataTableColumn<Affiliate>[] = [
    {
      key: 'dni',
      label: 'DNI',
      value: (a) => a.dni,
      cellClass: 'font-mono tabular-nums',
      hideable: false,
      filter: 'text',
    },
    {
      key: 'lastName',
      label: 'Apellido',
      value: (a) => a.lastName,
      filter: 'text',
    },
    {
      key: 'firstName',
      label: 'Nombre',
      value: (a) => a.firstName,
      filter: 'text',
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

  protected readonly trackByDni = (_: number, row: Affiliate): number => row.dni;

  /**
   * Toolbar actions consumed by the shared card. Reactive on `hasSelection()`
   * so the buttons disable/enable as the user picks a row. Order in the array
   * is the rendering order in the toolbar.
   */
  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'detail',
      icon: 'visibility',
      label: 'Detalle',
      tooltip: 'Ver detalle',
      disabled: !this.hasSelection(),
      handler: () => this.onShowDetail(),
    },
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar afiliado',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar afiliado',
      kind: 'warn',
      disabled: !this.hasSelection(),
      handler: () => this.onDelete(),
    },
  ]);

  constructor() {
    this.service.loadActive().subscribe();
    // Selection drop-out on filter change is handled by the wrapper.
  }

  /** Opens the read-only detail modal for the currently-selected affiliate. */
  private onShowDetail(): void {
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
  private onEdit(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    void this.router.navigate(['/afiliados', affiliate.dni, 'editar']);
  }

  /** Confirms + deletes the currently-selected affiliate. Clears the selection on success. */
  private onDelete(): void {
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
          this.snackBar.open('Afiliado eliminado', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar el afiliado', 'Cerrar'),
      });
    });
  }

  /** Manual refresh action exposed on the header; clears any prior selection. */
  protected onRefresh(): void {
    this.selectedAffiliate.set(null);
    this.service.loadActive().subscribe();
  }
}
