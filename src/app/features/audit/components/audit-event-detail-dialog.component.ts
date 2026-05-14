import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import type { AuditEvent } from '../audit.types';

/**
 * Modal that surfaces the full record of an audit event — the columns the list
 * grid does not have room for plus the raw payload JSON the backend persists.
 *
 * The audit list page exposes only the operational columns (timestamp, actor,
 * action, target). Picking a row and clicking "Detalle" opens this dialog so
 * the user can read trace/correlation ids (forensic lookups across logs) and
 * the payload that the use case captured for that specific event.
 *
 * Read-only by design. Audit entries are immutable; the only legitimate
 * follow-up is a manual correction through a new audited operation.
 */
@Component({
  selector: 'app-audit-event-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
  ],
  templateUrl: './audit-event-detail-dialog.component.html',
  styleUrl: './audit-event-detail-dialog.component.scss',
})
export class AuditEventDetailDialogComponent {
  protected readonly data = inject<AuditEvent>(MAT_DIALOG_DATA);

  /**
   * Localised occurredAt label. Falls back to the raw ISO string if Intl rejects
   * the input — better to show something than crash the modal.
   */
  protected readonly occurredAtLabel = formatInstant(this.data.occurredAt);

  /**
   * Prettified payload. Audit payloads are persisted as JSON strings; we attempt
   * a parse + pretty-print so the modal reads as a readable record. Non-JSON
   * payloads (none today, but the wire type allows free strings) fall back to
   * the raw value verbatim.
   */
  protected readonly prettyPayload = computed(() => {
    const raw = this.data.payload;
    if (raw === null || raw === '') {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  });
}

/**
 * Renders an ISO-8601 instant as a locale-aware `dd/MM/yyyy HH:mm:ss` label.
 * Returns the raw input when it cannot be parsed so the user still sees the
 * value during diagnosis instead of an empty cell.
 */
function formatInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
