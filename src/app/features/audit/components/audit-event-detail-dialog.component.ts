import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { DialogHeaderComponent, DraggableDialogDirective } from '../../../shared/dialog-header';
import { formatDateTimeWithSeconds } from '../../../shared/format';
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
    DialogHeaderComponent,
    DraggableDialogDirective,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
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
  protected readonly occurredAtLabel = formatDateTimeWithSeconds(this.data.occurredAt);

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
