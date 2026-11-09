import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';

import {
  formatArs,
  type DuesGenerationResult,
  type MembershipHolderSummary,
} from '../billing.types';
import { MembershipBillingService } from '../membership-billing.service';

/** Debounce for the holder search box, long enough to skip keystrokes, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Admin entry point of membership billing: find a holder ("titular") by DNI or name and open
 * their account, and bill a month on demand. The daily backend job already bills the current
 * month; the manual run is for catching up a past month or billing right after enrolments.
 */
@Component({
  selector: 'app-holders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './holders.page.html',
})
export class HoldersPage {
  private readonly service = inject(MembershipBillingService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatArs = formatArs;

  protected readonly search = this.fb.control('');
  /** `null` before the first search (nothing typed yet). */
  protected readonly results = signal<readonly MembershipHolderSummary[] | null>(null);
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);

  protected readonly period = this.fb.control(currentPeriod(), [Validators.required]);
  protected readonly maxPeriod = currentPeriod();
  protected readonly generating = signal(false);
  protected readonly generation = signal<DuesGenerationResult | null>(null);
  protected readonly generationError = signal<string | null>(null);

  constructor() {
    this.search.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        tap(() => this.searchError.set(null)),
        switchMap((value) => {
          if (!value) {
            return of(null);
          }
          this.searching.set(true);
          return this.service.searchHolders(value).pipe(
            catchError(() => {
              this.searchError.set('No se pudo buscar titulares.');
              return of([]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.searching.set(false);
        this.results.set(results);
      });
  }

  protected onGenerate(): void {
    const period = this.period.value;
    if (this.period.invalid || this.generating()) {
      return;
    }
    this.generating.set(true);
    this.generation.set(null);
    this.generationError.set(null);
    this.service.generateDues(period).subscribe({
      next: (result) => {
        this.generating.set(false);
        this.generation.set(result);
      },
      error: (err: { error?: { detail?: string } }) => {
        this.generating.set(false);
        this.generationError.set(err.error?.detail ?? 'No se pudieron generar las cuotas.');
      },
    });
  }
}

/** Current month as `yyyy-MM` in the browser's local time (the desk is in Argentina). */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
