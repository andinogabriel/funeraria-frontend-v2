import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableAutocompleteOption, DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { ItemService } from '../item.service';
import type { Item } from '../item.types';

/**
 * Items catalog list. Same selection-driven CRUD pattern; the columns here are
 * a bit denser (code, price, stock, category, brand) but every other piece of
 * scaffolding is shared with affiliates / plans / brands / categories through
 * the `<app-selection-list-card>`.
 */
@Component({
  selector: 'app-item-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
  templateUrl: './item-list.page.html',
  styleUrl: './item-list.page.scss',
})
export class ItemListPage {
  private readonly service = inject(ItemService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly rows = computed<readonly Item[]>(() => this.service.list() ?? []);

  protected readonly selectedItem = signal<Item | null>(null);
  protected readonly hasSelection = computed(() => this.selectedItem() !== null);

  /** Distinct category names derived from the currently-loaded items. */
  private readonly categoryOptions = computed<readonly DataTableAutocompleteOption[]>(() => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.category?.name) {
        distinct.add(item.category.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  });

  /** Distinct brand names derived from the currently-loaded items. */
  private readonly brandOptions = computed<readonly DataTableAutocompleteOption[]>(() => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.brand?.name) {
        distinct.add(item.brand.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  });

  protected readonly columns = computed<readonly DataTableColumn<Item>[]>(() => [
    {
      key: 'code',
      label: 'Código',
      value: (item) => item.code,
      cellClass: 'font-mono',
      hideable: false,
      filter: 'text',
    },
    { key: 'name', label: 'Nombre', value: (item) => item.name, filter: 'text' },
    {
      key: 'category',
      label: 'Categoría',
      value: (item) => item.category?.name ?? '',
      filter: 'autocomplete',
      autocomplete: {
        options: () => this.categoryOptions(),
        placeholder: 'Buscar categoría',
      },
    },
    {
      key: 'brand',
      label: 'Marca',
      value: (item) => item.brand?.name ?? '',
      filter: 'autocomplete',
      autocomplete: {
        options: () => this.brandOptions(),
        placeholder: 'Buscar marca',
      },
    },
    {
      key: 'price',
      label: 'Precio',
      value: (item) => formatCurrency(item.price),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
    {
      key: 'stock',
      label: 'Stock',
      value: (item) => item.stock ?? 0,
      cellClass: 'tabular-nums text-right',
      headerClass: 'text-right',
      align: 'end',
      defaultVisible: false,
    },
  ]);

  protected readonly trackByCode = (_: number, row: Item): string => row.code;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar item',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar item',
      kind: 'warn',
      disabled: !this.hasSelection(),
      handler: () => this.onDelete(),
    },
  ]);

  constructor() {
    this.service.loadAll().subscribe();
    // Selection drop-out on filter change is handled by the wrapper.
  }

  private onEdit(): void {
    const item = this.selectedItem();
    if (!item) return;
    void this.router.navigate(['/items', item.code, 'editar']);
  }

  private onDelete(): void {
    const item = this.selectedItem();
    if (!item) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar item',
        message: `¿Estás seguro de querer eliminar el item "${item.name}" (${item.code})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) return;
      this.service.delete(item.code).subscribe({
        next: () => {
          this.selectedItem.set(null);
          this.snackBar.open('Item eliminado', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar el item', 'Cerrar'),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedItem.set(null);
    this.service.loadAll().subscribe();
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
