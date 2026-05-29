import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, interval, map, startWith, switchMap, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Notification, NotificationPage, NotificationPageQuery } from './notification.types';

/**
 * Client for the in-app notification slice. Backend-side the notifications surface is
 * admin-only — every endpoint is gated by `hasRole('ADMIN')` — so this service is
 * safe to inject anywhere but only the admin bell + center actually exercises it.
 *
 * <h3>Why a poll instead of a stream</h3>
 *
 * The volume the design discussion settled on is ~150-250 alerts/year. A 60 s poll is
 * cheap (one tiny `unread-count` request) and dramatically simpler than SSE/WebSocket.
 * Operator UX is "see the badge a minute after the cross", which is plenty of time —
 * a low-stock alert is not a real-time concern. If volume ever shifts (PR introduces
 * more event types that ship hundreds/day), this is the seam where SSE plugs in.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/notifications`;

  /** Cadence (ms) of the unread-count poll. 60 s — see class comment for rationale. */
  private static readonly POLL_INTERVAL_MS = 60_000;

  private readonly _unreadCount = signal<number>(0);
  /** Reactive unread count — drives the bell badge. */
  readonly unreadCount = this._unreadCount.asReadonly();

  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private pollSub: { unsubscribe(): void } | null = null;

  /**
   * Boots the polling loop. Safe to call multiple times — re-arming a fresh poll
   * tears down the previous one. The loop self-cleans on the injector's destroy.
   */
  startPolling(): void {
    this.stopPolling();
    this.pollSub = interval(NotificationService.POLL_INTERVAL_MS)
      .pipe(
        // Fire one count immediately on subscribe so the badge does not blank-flash
        // for a full minute on app boot.
        startWith(0),
        switchMap(() => this.loadUnreadCount()),
      )
      .subscribe();
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  /** Tear-down the polling subscription. */
  stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    if (this.pollHandle !== null) {
      clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /**
   * One-shot fetch of the unread count. Updates the shared signal and returns the
   * value so callers can chain on it if needed (the bell uses the signal directly).
   */
  loadUnreadCount(): Observable<number> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/unread-count`).pipe(
      map((response) => response.count),
      tap((count) => this._unreadCount.set(count)),
    );
  }

  /** Paginated read. Used by the bell drop-down and the full notification center page. */
  loadPage(query: NotificationPageQuery = {}): Observable<NotificationPage> {
    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.limit !== undefined) params = params.set('limit', String(query.limit));
    if (query.onlyUnread !== undefined) {
      params = params.set('onlyUnread', String(query.onlyUnread));
    }
    return this.http.get<NotificationPage>(this.baseUrl, { params });
  }

  /**
   * Marks one notification as read. Backend is idempotent so re-flipping is a silent
   * no-op. Decrements the cached unread count optimistically on the way out — the
   * next poll reconciles with the server.
   */
  markRead(id: number): Observable<Notification> {
    return this.http.post<Notification>(`${this.baseUrl}/${id}/read`, null).pipe(
      tap(() => {
        const current = this._unreadCount();
        if (current > 0) {
          this._unreadCount.set(current - 1);
        }
      }),
    );
  }

  /**
   * Bulk flip. Resets the cached unread count to 0 immediately — the next poll
   * reconciles with the server (which returns the same 0 most of the time).
   */
  markAllRead(): Observable<{ affected: number }> {
    return this.http
      .post<{ affected: number }>(`${this.baseUrl}/read-all`, null)
      .pipe(tap(() => this._unreadCount.set(0)));
  }
}
