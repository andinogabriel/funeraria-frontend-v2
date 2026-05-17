import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';

/**
 * Generic yes/no confirmation dialog. Opened by features via `MatDialog.open(...)`; the
 * dialog resolves to `true` on confirm and `false` on cancel or backdrop click.
 *
 * Lives in `shared/` because every destructive action across the app needs the same
 * dialog (delete affiliate, delete funeral, revoke role, …). Specialising it per
 * feature would duplicate the same six lines of template.
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
    DragDropModule,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
  ],
  // The title bar acts as a drag handle for the whole dialog (Windows-style
  // window grab). `cdkDragRootElement` targets the CDK overlay pane so the
  // entire dialog — title, content and actions — moves as one unit instead of
  // just the heading. `cdkDragBoundary="body"` clamps movement to the viewport
  // so the dialog can't be dragged completely off-screen.
  template: `
    <h2
      mat-dialog-title
      cdkDrag
      cdkDragRootElement=".cdk-overlay-pane"
      cdkDragHandle
      cdkDragBoundary="body"
      class="cursor-move select-none"
    >
      {{ data.title }}
    </h2>
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
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
}
