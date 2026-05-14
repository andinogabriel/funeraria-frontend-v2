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
import { CategoryService } from '../category.service';
import type { Category } from '../category.types';

@Component({
  selector: 'app-category-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
  templateUrl: './category-list.page.html',
  styleUrl: './category-list.page.scss',
})
export class CategoryListPage {
  private readonly service = inject(CategoryService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly selectedCategory = signal<Category | null>(null);
  protected readonly hasSelection = computed(() => this.selectedCategory() !== null);

  protected readonly filtered = computed<readonly Category[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter((category) => category.name.toLowerCase().includes(term));
  });

  protected readonly columns: readonly DataTableColumn<Category>[] = [
    { key: 'name', label: 'Nombre', value: (category) => category.name, hideable: false },
    { key: 'description', label: 'Descripción', value: (category) => category.description ?? '' },
  ] as const;

  protected readonly trackById = (_: number, row: Category): number => row.id;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar categoría',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar categoría',
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
      const selected = this.selectedCategory();
      if (selected === null) return;
      const visible = this.filtered();
      if (!visible.some((category) => category.id === selected.id)) {
        this.selectedCategory.set(null);
      }
    });
  }

  private onEdit(): void {
    const category = this.selectedCategory();
    if (!category) return;
    void this.router.navigate(['/categorias', category.id, 'editar']);
  }

  private onDelete(): void {
    const category = this.selectedCategory();
    if (!category) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar categoría',
        message: `¿Estás seguro de querer eliminar la categoría "${category.name}"?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) return;
      this.service.delete(category.id).subscribe({
        next: () => {
          this.selectedCategory.set(null);
          this.snackBar.open('Categoría eliminada', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar la categoría', 'Cerrar'),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedCategory.set(null);
    this.service.loadAll().subscribe();
  }
}
