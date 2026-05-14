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
import { BrandService } from '../brand.service';
import type { Brand } from '../brand.types';

/**
 * Brands catalog list. Same selection-driven CRUD pattern as affiliates and plans;
 * the body of this page is intentionally trimmed to the data + handlers because
 * the visual chrome lives in `<app-selection-list-card>`.
 */
@Component({
  selector: 'app-brand-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
  templateUrl: './brand-list.page.html',
  styleUrl: './brand-list.page.scss',
})
export class BrandListPage {
  private readonly service = inject(BrandService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly selectedBrand = signal<Brand | null>(null);
  protected readonly hasSelection = computed(() => this.selectedBrand() !== null);

  protected readonly filtered = computed<readonly Brand[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter((brand) => brand.name.toLowerCase().includes(term));
  });

  protected readonly columns: readonly DataTableColumn<Brand>[] = [
    { key: 'name', label: 'Nombre', value: (brand) => brand.name, hideable: false },
    { key: 'webPage', label: 'Sitio web', value: (brand) => brand.webPage ?? '' },
  ] as const;

  protected readonly trackById = (_: number, row: Brand): number => row.id;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar marca',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar marca',
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

    effect(() => {
      const selected = this.selectedBrand();
      if (selected === null) {
        return;
      }
      const visible = this.filtered();
      if (!visible.some((brand) => brand.id === selected.id)) {
        this.selectedBrand.set(null);
      }
    });
  }

  private onEdit(): void {
    const brand = this.selectedBrand();
    if (!brand) return;
    void this.router.navigate(['/marcas', brand.id, 'editar']);
  }

  private onDelete(): void {
    const brand = this.selectedBrand();
    if (!brand) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar marca',
        message: `¿Estás seguro de querer eliminar la marca "${brand.name}"?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) return;
      this.service.delete(brand.id).subscribe({
        next: () => {
          this.selectedBrand.set(null);
          this.snackBar.open('Marca eliminada', 'OK', { duration: 3000 });
        },
        error: () => this.snackBar.open('No se pudo eliminar la marca', 'OK', { duration: 5000 }),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedBrand.set(null);
    this.service.loadAll().subscribe();
  }
}
