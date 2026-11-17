import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/confirm-dialog/confirm-dialog.component';
import { formatDateTime } from '../../../shared/format';
import { describeUserAgent } from '../describe-user-agent';
import { SessionService, sessionErrorMessage } from '../session.service';
import type { ActiveSession, DeviceDescription } from '../session.types';

interface SessionRow {
  readonly session: ActiveSession;
  readonly device: DeviceDescription;
}

/**
 * "Sesiones activas": every browser where the signed-in user has an open session (backend
 * ADR-0024), with a way to close the ones they do not recognise. Closing this browser's own
 * session is a logout, so that row only says "Este navegador".
 */
@Component({
  selector: 'app-active-sessions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './active-sessions.page.html',
})
export class ActiveSessionsPage {
  private readonly service = inject(SessionService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sessions = signal<readonly ActiveSession[]>([]);
  /** Id of the session being closed, or `'others'`, to disable the buttons meanwhile. */
  protected readonly closing = signal<number | 'others' | null>(null);

  protected readonly rows = computed<readonly SessionRow[]>(() =>
    this.sessions().map((session) => ({ session, device: describeUserAgent(session.userAgent) })),
  );
  protected readonly othersCount = computed(() => this.sessions().filter((s) => !s.current).length);

  protected readonly formatDateTime = formatDateTime;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.error.set(sessionErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected onClose(row: SessionRow): void {
    this.confirm({
      title: 'Cerrar sesión',
      message: `¿Cerrar la sesión de ${row.device.browser} en ${row.device.os}? Ese navegador va a tener que volver a iniciar sesión.`,
      confirmLabel: 'Cerrar sesión',
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed !== true) return;
      this.closing.set(row.session.id);
      this.service.close(row.session.id).subscribe({
        next: () => {
          this.sessions.update((all) => all.filter((s) => s.id !== row.session.id));
          this.closing.set(null);
          this.snackBar.open('Sesión cerrada.', 'OK', { duration: 3000 });
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this.closing.set(null);
          this.snackBar.open(sessionErrorMessage(err), 'OK', { duration: 5000 });
          this.load();
        },
      });
    });
  }

  protected onCloseOthers(): void {
    this.confirm({
      title: 'Cerrar las demás sesiones',
      message: `Se van a cerrar ${this.othersCount()} sesiones en otros navegadores. Esta sesión sigue abierta.`,
      confirmLabel: 'Cerrar las demás',
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed !== true) return;
      this.closing.set('others');
      this.service.closeOthers().subscribe({
        next: (closed) => {
          this.sessions.update((all) => all.filter((s) => s.current));
          this.closing.set(null);
          this.snackBar.open(
            closed === 1 ? 'Se cerró 1 sesión.' : `Se cerraron ${closed} sesiones.`,
            'OK',
            { duration: 3000 },
          );
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this.closing.set(null);
          this.snackBar.open(sessionErrorMessage(err), 'OK', { duration: 5000 });
          this.load();
        },
      });
    });
  }

  private confirm(data: ConfirmDialogData) {
    return this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        width: '440px',
        data,
      })
      .afterClosed();
  }
}
