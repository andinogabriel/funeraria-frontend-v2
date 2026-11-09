import { inject, Injectable } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';

import { CommandPaletteComponent } from './command-palette.component';

/**
 * Opens the command palette (Ctrl+K / Cmd+K). Keeps at most one palette on screen: pressing
 * the shortcut again while it is open is a no-op instead of stacking a second dialog.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly dialog = inject(MatDialog);
  private ref: MatDialogRef<CommandPaletteComponent> | null = null;

  open(): void {
    if (this.ref) {
      return;
    }
    this.ref = this.dialog.open(CommandPaletteComponent, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      position: { top: '12vh' },
      // The palette focuses its own input on first render (see CommandPaletteComponent).
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'app-command-palette-panel',
      ariaLabel: 'Buscar y navegar',
    });
    this.ref.afterClosed().subscribe(() => (this.ref = null));
  }

  /** `true` for Ctrl+K (Windows / Linux) and Cmd+K (macOS), without Shift or Alt. */
  isShortcut(event: KeyboardEvent): boolean {
    return (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'k'
    );
  }
}
