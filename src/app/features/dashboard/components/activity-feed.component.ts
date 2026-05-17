import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Single entry in the recent-activity feed. Designed so a future feed driven
 * by the backend outbox (ADR-0013 published events) can map straight onto
 * this shape: `eventType → icon`, `aggregateId → title`, formatted
 * `occurredAt → time`, the human-readable summary → `body`.
 */
export interface ActivityItem {
  readonly icon: string;
  readonly tone: 'primary' | 'secondary' | 'tertiary' | 'neutral';
  /** Headline of the activity entry; e.g. "Servicio creado". */
  readonly title: string;
  /** Optional supporting body line. */
  readonly body?: string;
  /** Display time / relative date label; e.g. "hace 5 minutos", "Hoy 09:42". */
  readonly time: string;
}

/**
 * Recent-activity feed rendered as a vertical timeline in the dashboard's
 * right column. Items are passed in as a readonly array — the dashboard page
 * owns the source (placeholder strings today; the outbox event stream
 * tomorrow) so this component stays a dumb presentational widget that can
 * later be repurposed by any feature that needs a timeline (e.g. the audit
 * log surface, the per-affiliate history view).
 */
@Component({
  selector: 'app-activity-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss',
})
export class ActivityFeedComponent {
  readonly items = input.required<readonly ActivityItem[]>();
}
