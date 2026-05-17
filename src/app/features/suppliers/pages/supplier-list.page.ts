import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { SupplierDetailDialogComponent } from '../components/supplier-detail-dialog.component';
import { SupplierService } from '../supplier.service';
import type { Supplier } from '../supplier.types';

/**
 * Suppliers (proveedores) list. Mirrors the affiliate / item / plan / funeral pattern via
 * `SelectionListCardComponent`. Admin-only on the backend; the sidebar entry also gates
 * visibility so a regular USER never reaches this surface unless they deep-link.
 */
@Component({
  selector: 'app-supplier-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
  templateUrl: './supplier-list.page.html',
  styleUrl: './supplier-list.page.scss',
})
export class SupplierListPage {
  private readonly service = inject(SupplierService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly selectedSupplier = signal<Supplier | null>(null);
  protected readonly hasSelection = computed(() => this.selectedSupplier() !== null);

  protected readonly filtered = computed<readonly Supplier[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim();
    if (!term) {
      return all;
    }
    const needle = foldDiacritics(term).toLowerCase();
    return all.filter((supplier) => {
      const haystack = foldDiacritics(
        `${supplier.name} ${supplier.nif} ${supplier.email}`,
      ).toLowerCase();
      return haystack.includes(needle);
    });
  });

  protected readonly columns: readonly DataTableColumn<Supplier>[] = [
    {
      key: 'name',
      label: 'Razón social',
      value: (supplier) => supplier.name,
      hideable: false,
    },
    {
      key: 'nif',
      label: 'NIF / CUIT',
      value: (supplier) => supplier.nif,
      cellClass: 'font-mono',
    },
    {
      key: 'email',
      label: 'Email',
      value: (supplier) => supplier.email,
    },
    {
      key: 'webPage',
      label: 'Sitio web',
      value: (supplier) => supplier.webPage ?? '—',
    },
  ] as const;

  protected readonly trackByNif = (_: number, row: Supplier): string => row.nif;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'detail',
      icon: 'visibility',
      label: 'Detalle',
      tooltip: 'Ver detalle del proveedor',
      disabled: !this.hasSelection(),
      handler: () => this.onShowDetail(),
    },
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar proveedor',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar proveedor',
      kind: 'warn',
      disabled: !this.hasSelection(),
      handler: () => this.onDelete(),
    },
  ]);

  constructor() {
    this.service.loadAll().subscribe();

    this.searchControl.valueChanges
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe((value) => this.searchTerm.set(value));

    // Clear the selection when the active row drops out of the visible set after a
    // filter change, so the action buttons that depend on hasSelection() reflect truth.
    effect(() => {
      const selected = this.selectedSupplier();
      if (selected === null) {
        return;
      }
      const visible = this.filtered();
      if (!visible.some((supplier) => supplier.nif === selected.nif)) {
        this.selectedSupplier.set(null);
      }
    });
  }

  private onShowDetail(): void {
    const supplier = this.selectedSupplier();
    if (!supplier) {
      return;
    }
    this.dialog.open(SupplierDetailDialogComponent, {
      data: supplier,
      width: '560px',
      maxWidth: '95vw',
    });
  }

  private onEdit(): void {
    const supplier = this.selectedSupplier();
    if (!supplier) {
      return;
    }
    void this.router.navigate(['/proveedores', supplier.nif, 'editar']);
  }

  private onDelete(): void {
    const supplier = this.selectedSupplier();
    if (!supplier) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar proveedor',
        message: `¿Estás seguro de querer eliminar a ${supplier.name} (NIF ${supplier.nif})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      this.service.delete(supplier.nif).subscribe({
        next: () => {
          this.selectedSupplier.set(null);
          this.snackBar.open('Proveedor eliminado', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar el proveedor', 'Cerrar'),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedSupplier.set(null);
    this.service.loadAll().subscribe();
  }
}

function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
