import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
} from '@angular/material/dialog';

import { DialogHeaderComponent, DraggableDialogDirective } from '../dialog-header';

/**
 * Generic yes/no confirmation dialog. Opened by features via `MatDialog.open(...)`; the
 * dialog resolves to `true` on confirm and `false` on cancel, backdrop click, or
 * close via the header X (callers always check for `=== true`).
 *
 * Lives in `shared/` because every destructive action across the app needs the same
 * dialog (delete affiliate, delete funeral, revoke role, …). Specialising it per
 * feature would duplicate the same six lines of template.
 *
 * <h3>Draggable header + close X</h3>
 *
 * Uses the shared {@link DialogHeaderComponent} and {@link DraggableDialogDirective}
 * so the operator can grab the header strip to reposition the modal — same
 * affordance every other dialog in the app got. The X in the header dismisses
 * the dialog with `undefined`, which callers treat as "not confirmed".
 */
export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  /** Label of the confirm button. Defaults to "Confirmar". */
  readonly confirmLabel?: string;
  /** Label of the cancel button. Defaults to "Cancelar". */
  readonly cancelLabel?: string;
  /**
   * When `true` the confirm button is rendered with `color="warn"` (red); use for
   * destructive actions so the user is visually nudged towards "Cancelar".
   */
  readonly destructive?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogHeaderComponent,
    DraggableDialogDirective,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
  ],
  template: `
    <div appDraggableDialog>
      <app-dialog-header>{{ data.title }}</app-dialog-header>
      <mat-dialog-content>
        <p class="m-0">{{ data.message }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">
          {{ data.cancelLabel ?? 'Cancelar' }}
        </button>
        <button
          mat-flat-button
          [color]="data.destructive ? 'warn' : 'primary'"
          [mat-dialog-close]="true"
        >
          {{ data.confirmLabel ?? 'Confirmar' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
}
