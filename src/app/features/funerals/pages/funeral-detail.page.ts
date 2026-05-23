import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { formatDate, formatDateTime } from '../../../shared/format';
import { FuneralService } from '../funeral.service';
import type { Funeral } from '../funeral.types';

/**
 * Dedicated route for a single funeral service. Replaces the previous
 * "Detalle" modal — a funeral is a legal document, so a proper URL
 * (browser-navigable, bookmarkable, shareable) carries more value than a
 * dismissible dialog.
 *
 * <h3>Data flow</h3>
 *
 * The route reads the `id` query parameter and tries the in-memory cache
 * first ({@link FuneralService#findById}). When the cache is cold — e.g. a
 * deep-link from a bookmark or e-mail — we kick off a {@link FuneralService#loadAll}
 * and try the lookup again. The lookup happens on every URL change so
 * navigating between two `/servicios/:id` pages re-renders cleanly.
 *
 * <h3>Actions</h3>
 *
 * The header carries four icon-only buttons (44 px tap targets) on every
 * viewport:
 *
 * <ul>
 *   <li><b>Imprimir / PDF</b> — calls `service.downloadPdf(id)`, builds a
 *       blob URL and triggers an attribute download. The auth headers
 *       attached by the HttpClient interceptor travel with the request,
 *       so the operator does not have to sign the URL.</li>
 *   <li><b>Editar</b> — navigates to `/servicios/:id/editar` (existing
 *       form route).</li>
 *   <li><b>Eliminar</b> — opens the standard confirmation dialog; on
 *       confirm fires `service.delete(id)` and navigates back to the
 *       listing.</li>
 *   <li><b>Volver</b> — top-left back arrow returning to the listing.</li>
 * </ul>
 *
 * The body mirrors the field set the old modal showed (Servicio /
 * Fallecido / Recibo / Items / Auditoría) but laid out for a full-page
 * surface instead of a 520 px-wide dialog.
 */
@Component({
  selector: 'app-funeral-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './funeral-detail.page.html',
  styleUrl: './funeral-detail.page.scss',
})
export class FuneralDetailPage {
  private readonly service = inject(FuneralService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** Numeric id parsed from the `:id` route segment; `null` on a malformed URL. */
  private readonly id: Signal<number | null> = toSignal(
    this.route.paramMap.pipe(
      map((params) => {
        const raw = params.get('id');
        if (raw === null) {
          return null;
        }
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      }),
    ),
    { initialValue: this.parseInitialId() },
  );

  /**
   * Cached lookup result. `undefined` while the lookup is in flight, `null`
   * when the id resolves to nothing (404 path), the entity otherwise.
   * Triggered on every id change — going from `/servicios/1` to `/servicios/2`
   * re-renders without reload.
   */
  protected readonly funeral = signal<Funeral | null | undefined>(undefined);

  /** True while the PDF download is in flight; disables the button. */
  protected readonly downloadingPdf = signal(false);

  protected readonly title = computed(() => {
    const funeral = this.funeral();
    if (!funeral) {
      return 'Servicio funerario';
    }
    return `${funeral.deceased.firstName} ${funeral.deceased.lastName}`;
  });

  protected readonly totalLabel = computed(() => {
    const funeral = this.funeral();
    return funeral ? formatCurrency(funeral.totalAmount) : '—';
  });

  protected readonly funeralDateLabel = computed(() => {
    const funeral = this.funeral();
    return funeral ? formatDateTime(funeral.funeralDate) : '—';
  });

  protected readonly registerDateLabel = computed(() => {
    const funeral = this.funeral();
    return funeral?.registerDate ? formatDateTime(funeral.registerDate) : '—';
  });

  protected readonly birthDateLabel = computed(() => {
    const funeral = this.funeral();
    return funeral ? formatDate(funeral.deceased.birthDate) : '—';
  });

  protected readonly deathDateLabel = computed(() => {
    const funeral = this.funeral();
    return funeral ? formatDate(funeral.deceased.deathDate) : '—';
  });

  protected readonly taxLabel = computed(() => {
    const funeral = this.funeral();
    if (!funeral) {
      return '—';
    }
    return funeral.tax !== null && funeral.tax !== undefined ? `${funeral.tax} %` : '—';
  });

  /** Joined "Calle 123, Dpto B, Piso 2 — Mar del Plata" string, or null. */
  protected readonly placeOfDeathLabel = computed(() => {
    const funeral = this.funeral();
    if (!funeral) {
      return null;
    }
    const address = funeral.deceased.placeOfDeath;
    if (!address || !address.streetName) {
      return null;
    }
    const parts: string[] = [address.streetName];
    if (address.blockStreet !== undefined && address.blockStreet !== null) {
      parts[parts.length - 1] += ` ${address.blockStreet}`;
    }
    if (address.apartment) {
      parts.push(`Dpto ${address.apartment}`);
    }
    if (address.flat) {
      parts.push(`Piso ${address.flat}`);
    }
    const head = parts.join(', ');
    return address.city?.name ? `${head} — ${address.city.name}` : head;
  });

  constructor() {
    // Trigger the lookup whenever the id changes (initial mount + in-app navigation
    // between two detail routes). `loadAll` only fires when the cache is cold to
    // avoid a redundant round-trip on the common path.
    this.fetchOnIdChange();
  }

  protected onDownloadPdf(): void {
    const funeral = this.funeral();
    if (!funeral || this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    this.service.downloadPdf(funeral.id).subscribe({
      next: (blob) => {
        this.triggerBlobDownload(blob, `servicio-${funeral.id}.pdf`);
        this.downloadingPdf.set(false);
      },
      error: () => {
        this.downloadingPdf.set(false);
        this.snackBar.open('No se pudo generar el PDF', 'Cerrar');
      },
    });
  }

  protected onDelete(): void {
    const funeral = this.funeral();
    if (!funeral) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar servicio',
        message: `¿Estás seguro de querer eliminar el servicio de ${funeral.deceased.firstName} ${funeral.deceased.lastName} (DNI ${funeral.deceased.dni})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      this.service.removeFromCachedPage(funeral.id);
      this.service.delete(funeral.id).subscribe({
        next: () => {
          this.snackBar.open('Servicio eliminado', 'Cerrar');
          void this.router.navigate(['/servicios']);
        },
        error: () => this.snackBar.open('No se pudo eliminar el servicio', 'Cerrar'),
      });
    });
  }

  /**
   * Re-runs the cached lookup whenever the route id changes. The first miss
   * triggers a fresh `loadAll` — same pattern the funeral form page uses,
   * so a deep-link to a never-visited record still works.
   */
  private fetchOnIdChange(): void {
    let lastTriedColdLoad = false;
    this.route.paramMap.subscribe((params) => {
      const raw = params.get('id');
      const id = raw === null ? NaN : Number(raw);
      if (!Number.isFinite(id)) {
        this.funeral.set(null);
        return;
      }
      const cached = this.service.findById(id);
      if (cached) {
        this.funeral.set(cached);
        return;
      }
      if (lastTriedColdLoad) {
        // Already tried to warm the cache and the id still does not exist.
        this.funeral.set(null);
        return;
      }
      lastTriedColdLoad = true;
      this.funeral.set(undefined);
      this.service.loadAll().subscribe(() => {
        this.funeral.set(this.service.findById(id) ?? null);
      });
    });
  }

  private parseInitialId(): number | null {
    const raw = this.route.snapshot.paramMap.get('id');
    if (raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Builds a temporary object URL for the blob and triggers a programmatic
   * `<a download>` click so the browser saves the file with the desired
   * name. The URL is revoked immediately afterwards — the download already
   * holds a reference to the underlying blob.
   */
  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
