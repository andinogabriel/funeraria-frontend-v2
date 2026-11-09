import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { coverageReasonLabel, formatIsoDate, type ClaimEligibility } from '../billing.types';

/**
 * Banner with the membership coverage verdict of a deceased affiliate (backend ADR-0022). Used
 * live in the funeral form (`detail` carries the full evaluation) and on the funeral detail with
 * the snapshot recorded at registration (only `eligible` + `reasons`). Informational: a
 * non-covered death can still be registered; the service is then paid privately.
 */
@Component({
  selector: 'app-coverage-verdict',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div
      role="status"
      data-testid="coverage-verdict"
      class="flex gap-3 rounded-md p-3 text-sm"
      [class]="
        eligible()
          ? 'bg-[var(--mat-sys-secondary-container)] text-[var(--mat-sys-on-secondary-container)]'
          : 'bg-[var(--mat-sys-error-container)] text-[var(--mat-sys-on-error-container)]'
      "
    >
      <mat-icon class="material-symbols-outlined shrink-0">
        {{ eligible() ? 'verified' : 'report' }}
      </mat-icon>
      <div class="flex flex-col gap-1">
        <strong>{{
          eligible() ? 'Cubierto por la membresía' : 'No cubierto por la membresía'
        }}</strong>
        @for (reason of reasonLabels(); track reason) {
          <span>{{ reason }}</span>
        }
        @if (detail(); as d) {
          <span class="text-xs opacity-80">
            @if (d.accidental) {
              Muerte accidental: sin carencia.
            } @else if (d.coveredFrom) {
              Carencia de {{ d.waitingPeriodMonths }} meses, cubierto desde
              {{ formatIsoDate(d.coveredFrom) }}.
            }
            Cuotas vencidas: {{ d.overdueCount }} (tolera {{ d.overdueGraceCount }}).
          </span>
        }
      </div>
    </div>
  `,
})
export class CoverageVerdictComponent {
  readonly eligible = input.required<boolean>();
  readonly reasons = input<readonly string[]>([]);
  /** Full live evaluation, when available. */
  readonly detail = input<ClaimEligibility | null>(null);

  protected readonly formatIsoDate = formatIsoDate;
  protected readonly reasonLabels = computed(() => this.reasons().map(coverageReasonLabel));
}
