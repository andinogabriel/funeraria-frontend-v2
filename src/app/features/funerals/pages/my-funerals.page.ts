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
import { debounceTime } from 'rxjs/operators';

import type { DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { FuneralDetailDialogComponent } from '../components/funeral-detail-dialog.component';
import { FuneralService } from '../funeral.service';
import type { Funeral } from '../funeral.types';

/**
 * Read-only "Mis servicios" view for the rol USER. Backed by
 * `GET /api/v1/funerals/by-user` — the backend returns just the funerals
 * owned by the authenticated user, so the operator sees a clean list of
 * their own work without the admin grid noise.
 *
 * <h3>Why read-only</h3>
 *
 * The action set is intentionally just `Detalle`. Plain USERs can edit and
 * delete their own funerals on the backend (the endpoints accept
 * `hasRole('USER')`) but mixing the write actions here would make the page
 * feel like a duplicate of `/servicios`. If we discover operators do want
 * to edit from this surface, the same routes work — just enable the
 * actions then.
 */
@Component({
  selector: 'app-my-funerals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, SelectionListCardComponent],
  templateUrl: './my-funerals.page.html',
  styleUrl: './my-funerals.page.scss',
})
export class MyFuneralsPage {
  private readonly service = inject(FuneralService);
  private readonly dialog = inject(MatDialog);

  protected readonly loading = this.service.byUserLoading;
  protected readonly error = this.service.byUserError;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly selectedFuneral = signal<Funeral | null>(null);
  protected readonly hasSelection = computed(() => this.selectedFuneral() !== null);

  protected readonly filtered = computed<readonly Funeral[]>(() => {
    const all = this.service.byUserList() ?? [];
    const term = this.searchTerm().trim();
    if (!term) {
      return all;
    }
    const needle = foldDiacritics(term).toLowerCase();
    return all.filter((funeral) => {
      const haystack = foldDiacritics(
        `${funeral.deceased.firstName} ${funeral.deceased.lastName} ${funeral.deceased.dni} ${funeral.receiptNumber ?? ''}`,
      ).toLowerCase();
      return haystack.includes(needle);
    });
  });

  protected readonly columns: readonly DataTableColumn<Funeral>[] = [
    {
      key: 'deceasedName',
      label: 'Fallecido',
      value: (funeral) => `${funeral.deceased.firstName} ${funeral.deceased.lastName}`,
      hideable: false,
    },
    {
      key: 'dni',
      label: 'DNI',
      value: (funeral) => funeral.deceased.dni,
      cellClass: 'tabular-nums',
    },
    {
      key: 'funeralDate',
      label: 'Fecha del servicio',
      value: (funeral) => funeral.funeralDate,
      cellClass: 'tabular-nums whitespace-nowrap',
    },
    {
      key: 'plan',
      label: 'Plan',
      value: (funeral) => funeral.plan.name,
    },
    {
      key: 'totalAmount',
      label: 'Total',
      value: (funeral) => funeral.totalAmount,
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
  ] as const;

  protected readonly trackById = (_: number, row: Funeral): number => row.id;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'detail',
      icon: 'visibility',
      label: 'Detalle',
      tooltip: 'Ver detalle del servicio',
      disabled: !this.hasSelection(),
      handler: () => this.onShowDetail(),
    },
  ]);

  constructor() {
    this.service.loadByUser().subscribe();

    this.searchControl.valueChanges
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe((value) => this.searchTerm.set(value));

    effect(() => {
      const selected = this.selectedFuneral();
      if (selected === null) {
        return;
      }
      const visible = this.filtered();
      if (!visible.some((funeral) => funeral.id === selected.id)) {
        this.selectedFuneral.set(null);
      }
    });
  }

  private onShowDetail(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    this.dialog.open(FuneralDetailDialogComponent, {
      data: funeral,
      width: '640px',
      maxWidth: '95vw',
    });
  }

  protected onRefresh(): void {
    this.selectedFuneral.set(null);
    this.service.loadByUser().subscribe();
  }
}

function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
