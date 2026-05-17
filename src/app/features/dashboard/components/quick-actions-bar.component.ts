import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { RouterLink } from '@angular/router';

/**
 * Quick-action shortcut consumed by {@link QuickActionsBarComponent}. Each
 * entry renders as a tappable tile that routes the operator straight to the
 * most-used create surfaces ("Nuevo servicio", "Nuevo afiliado", etc.) without
 * a side-nav round-trip.
 */
export interface QuickAction {
  readonly icon: string;
  readonly label: string;
  readonly routerLink: string;
  /** Optional short helper line under the label. */
  readonly hint?: string;
}

/**
 * Horizontal-scrolling shortcut bar for the dashboard. On desktop the tiles
 * lay out in a 4-column grid; on phones the row turns into a scroll-snap
 * carousel so additional actions can be added later without breaking the
 * layout. Material's ripple effect provides the tap affordance.
 */
@Component({
  selector: 'app-quick-actions-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatRippleModule, RouterLink],
  templateUrl: './quick-actions-bar.component.html',
  styleUrl: './quick-actions-bar.component.scss',
})
export class QuickActionsBarComponent {
  readonly actions = input.required<readonly QuickAction[]>();
}
