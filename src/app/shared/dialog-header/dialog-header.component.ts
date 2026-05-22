import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogClose, MatDialogTitle } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Standardised header strip for every modal dialog in the app.
 *
 * <h3>What it gives the operator</h3>
 *
 * <ul>
 *   <li><b>Drag handle</b>: the whole header strip is a {@link CdkDragHandle},
 *       so the dialog can be repositioned by grabbing the title — same affordance
 *       a desktop OS window gives. Drag works only via this row, never via the
 *       body content where the operator clicks form fields or scrolls lists.</li>
 *   <li><b>Close X</b>: a Material icon button on the right-hand side, wired to
 *       {@link MatDialogClose} so it dismisses the dialog without needing the
 *       parent to listen for a custom event. Carries a tooltip + aria-label so
 *       screen-reader and touch users both have a discoverable close path.</li>
 *   <li><b>Optional leading icon</b>: a Material Symbol displayed next to the
 *       title. Most dialogs in the app already used one (person, receipt_long,
 *       …) so the input keeps that vocabulary.</li>
 * </ul>
 *
 * <h3>How to use it</h3>
 *
 * The directive {@link DraggableDialogDirective} should sit on the dialog's
 * root element so CdkDrag is in the injector hierarchy when this header
 * mounts. Typical usage:
 *
 * ```html
 * <div appDraggableDialog>
 *   <app-dialog-header icon="person">{{ data.firstName }} {{ data.lastName }}</app-dialog-header>
 *   <mat-dialog-content>...</mat-dialog-content>
 *   <mat-dialog-actions align="end">...</mat-dialog-actions>
 * </div>
 * ```
 */
@Component({
  selector: 'app-dialog-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDragHandle,
    MatButtonModule,
    MatDialogClose,
    MatDialogTitle,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './dialog-header.component.html',
  styleUrl: './dialog-header.component.scss',
})
export class DialogHeaderComponent {
  /** Optional Material Symbol name rendered before the title text. */
  readonly icon = input<string | undefined>(undefined);
}
