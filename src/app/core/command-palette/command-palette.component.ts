import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { forkJoin, of, type Observable } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';

import { AffiliateService } from '../../features/affiliates/affiliate.service';
import { MembershipBillingService } from '../../features/membership/membership-billing.service';
import { normaliseForSearch } from '../../shared/search';
import { AuthStore } from '../auth/auth.store';
import { isNavItemVisible, NAV_ITEMS } from '../layout/nav-items';
import { ThemeService, type ThemePreference } from '../theme/theme.service';

/** Wait after the last keystroke before searching the backend. */
export const PALETTE_SEARCH_DEBOUNCE_MS = 250;

/** Shortest term that triggers a backend search (one letter matches half the registry). */
export const PALETTE_MIN_REMOTE_TERM = 2;

/** Most results shown per backend group, so one broad term does not bury the commands. */
export const PALETTE_REMOTE_LIMIT = 5;

export type PaletteGroup = 'Ir a' | 'Crear' | 'Tema' | 'Afiliados' | 'Titulares';

export interface PaletteEntry {
  readonly id: string;
  readonly group: PaletteGroup;
  readonly label: string;
  readonly icon: string;
  /** Secondary text on the right (DNI, shortcut, current state). */
  readonly hint?: string;
  /** Extra words that match the entry without showing ("alta", "agregar"). */
  readonly keywords?: string;
  readonly run: () => void;
}

interface PaletteSection {
  readonly group: PaletteGroup;
  readonly items: readonly { readonly entry: PaletteEntry; readonly index: number }[];
}

interface CreateAction {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly requiresAdmin?: boolean;
}

const CREATE_ACTIONS: readonly CreateAction[] = [
  { path: '/servicios/nuevo', label: 'Nuevo servicio', icon: 'church' },
  { path: '/afiliados/nuevo', label: 'Nuevo afiliado', icon: 'person_add' },
  { path: '/items/nuevo', label: 'Nuevo item', icon: 'inventory_2' },
  { path: '/planes/nuevo', label: 'Nuevo plan', icon: 'workspace_premium' },
  { path: '/marcas/nueva', label: 'Nueva marca', icon: 'sell' },
  { path: '/categorias/nueva', label: 'Nueva categoría', icon: 'category' },
  { path: '/ingresos/nuevo', label: 'Nuevo ingreso', icon: 'receipt_long', requiresAdmin: true },
  {
    path: '/proveedores/nuevo',
    label: 'Nuevo proveedor',
    icon: 'local_shipping',
    requiresAdmin: true,
  },
];

const THEMES: readonly { pref: ThemePreference; label: string; icon: string }[] = [
  { pref: 'auto', label: 'Tema automático', icon: 'brightness_auto' },
  { pref: 'light', label: 'Tema claro', icon: 'light_mode' },
  { pref: 'dark', label: 'Tema oscuro', icon: 'dark_mode' },
];

/**
 * Command palette: one search box that jumps to any screen, starts a create form, switches the
 * theme, or finds an affiliate / membership holder on the backend.
 *
 * <h3>Matching</h3>
 *
 * Local commands match on label, group and keywords through {@link normaliseForSearch}, so
 * "categoria" finds "Categorías". From {@link PALETTE_MIN_REMOTE_TERM} characters the term
 * also goes to the backend, debounced; a failed search just contributes no results, because
 * the local commands are still useful.
 *
 * <h3>Keyboard and ARIA</h3>
 *
 * Follows the WAI-ARIA combobox-with-listbox pattern: focus stays in the input, the arrow keys
 * move `aria-activedescendant` (wrapping at both ends), Enter runs the active entry and Escape
 * closes the dialog (MatDialog handles that one).
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressBarModule, ReactiveFormsModule],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly dialogRef = inject<MatDialogRef<CommandPaletteComponent>>(MatDialogRef);
  private readonly router = inject(Router);
  private readonly store = inject(AuthStore);
  private readonly theme = inject(ThemeService);
  private readonly affiliates = inject(AffiliateService);
  private readonly billing = inject(MembershipBillingService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly term = toSignal(this.search.valueChanges.pipe(map((v) => v.trim())), {
    initialValue: '',
  });

  protected readonly remote = signal<readonly PaletteEntry[]>([]);
  protected readonly searching = signal(false);
  private readonly activeIndex = signal(0);

  private readonly isAdmin = computed(() => this.store.authorities().includes('ROLE_ADMIN'));

  private readonly commands = computed<readonly PaletteEntry[]>(() => {
    const authorities = this.store.authorities();
    const preference = this.theme.preference();
    const nav = NAV_ITEMS.filter((item) => isNavItemVisible(item, authorities)).map(
      (item): PaletteEntry => ({
        id: `nav:${item.path}`,
        group: 'Ir a',
        label: item.label,
        icon: item.icon,
        run: () => void this.router.navigateByUrl(item.path),
      }),
    );
    const create = CREATE_ACTIONS.filter((action) => isNavItemVisible(action, authorities)).map(
      (action): PaletteEntry => ({
        id: `create:${action.path}`,
        group: 'Crear',
        label: action.label,
        icon: action.icon,
        keywords: 'alta agregar crear nuevo nueva',
        run: () => void this.router.navigateByUrl(action.path),
      }),
    );
    const themes = THEMES.map((t): PaletteEntry => ({
      id: `theme:${t.pref}`,
      group: 'Tema',
      label: t.label,
      icon: t.icon,
      hint: t.pref === preference ? 'Actual' : undefined,
      keywords: 'apariencia modo color',
      run: () => this.theme.setPreference(t.pref),
    }));
    return [...nav, ...create, ...themes];
  });

  /** Every visible entry, in display order: matching commands first, then backend results. */
  protected readonly entries = computed<readonly PaletteEntry[]>(() => {
    const needle = normaliseForSearch(this.term());
    const local = needle
      ? this.commands().filter((entry) =>
          normaliseForSearch(`${entry.label} ${entry.group} ${entry.keywords ?? ''}`).includes(
            needle,
          ),
        )
      : this.commands();
    return [...local, ...this.remote()];
  });

  protected readonly sections = computed<readonly PaletteSection[]>(() => {
    const sections: { group: PaletteGroup; items: { entry: PaletteEntry; index: number }[] }[] = [];
    this.entries().forEach((entry, index) => {
      const last = sections.at(-1);
      if (last?.group === entry.group) {
        last.items.push({ entry, index });
      } else {
        sections.push({ group: entry.group, items: [{ entry, index }] });
      }
    });
    return sections;
  });

  /** Active row, clamped so a shrinking result list never points past its end. */
  protected readonly active = computed(() =>
    Math.min(this.activeIndex(), Math.max(this.entries().length - 1, 0)),
  );

  protected readonly activeId = computed(() =>
    this.entries().length > 0 ? this.optionId(this.active()) : null,
  );

  constructor() {
    // Focus on the first render instead of waiting for MatDialog's autoFocus, which runs after
    // the open animation: an operator who types right after Ctrl+K would lose those keys.
    afterNextRender(() => this.input().nativeElement.focus());

    this.search.valueChanges
      .pipe(
        map((value) => value.trim()),
        tap(() => this.activeIndex.set(0)),
        debounceTime(PALETTE_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((term) => {
          if (term.length < PALETTE_MIN_REMOTE_TERM) {
            this.searching.set(false);
            return of([]);
          }
          this.searching.set(true);
          return this.searchRemote(term);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.searching.set(false);
        this.remote.set(results);
      });
  }

  protected optionId(index: number): string {
    return `palette-option-${index}`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.entries().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.moveTo((this.active() + step + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = this.entries()[this.active()];
      if (entry) {
        this.run(entry);
      }
    }
  }

  protected onHover(index: number): void {
    this.activeIndex.set(index);
  }

  protected run(entry: PaletteEntry): void {
    this.dialogRef.close();
    entry.run();
  }

  private moveTo(index: number): void {
    this.activeIndex.set(index);
    // The option ids are stable per index, so the target row is already in the DOM.
    const row = this.host.nativeElement.querySelector(`#${this.optionId(index)}`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  private searchRemote(term: string): Observable<readonly PaletteEntry[]> {
    const affiliates$ = this.affiliates.search(term).pipe(
      map((list) =>
        list.slice(0, PALETTE_REMOTE_LIMIT).map((a): PaletteEntry => ({
          id: `affiliate:${a.dni}`,
          group: 'Afiliados',
          label: `${a.lastName}, ${a.firstName}`,
          icon: 'person',
          hint: a.deceased ? `DNI ${a.dni} · Fallecido` : `DNI ${a.dni}`,
          run: () => void this.router.navigate(['/afiliados'], { queryParams: { dni: a.dni } }),
        })),
      ),
      catchError(() => of([])),
    );
    const holders$ = this.isAdmin()
      ? this.billing.searchHolders(term).pipe(
          map((list) =>
            list.slice(0, PALETTE_REMOTE_LIMIT).map((summary): PaletteEntry => ({
              id: `holder:${summary.holder.dni}`,
              group: 'Titulares',
              label: `${summary.holder.lastName}, ${summary.holder.firstName}`,
              icon: 'family_restroom',
              hint: `DNI ${summary.holder.dni}`,
              run: () => void this.router.navigate(['/titulares', summary.holder.dni]),
            })),
          ),
          catchError(() => of([])),
        )
      : of([]);
    return forkJoin([affiliates$, holders$]).pipe(
      map(([affiliates, holders]) => [...affiliates, ...holders]),
    );
  }
}
