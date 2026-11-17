import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localeEsAr from '@angular/common/locales/es-AR';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import type { Provider, Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  type ParamMap,
} from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import type { Page } from '../app/core/api/pagination.types';
import { AuthStore } from '../app/core/auth/auth.store';
import { PaginatorIntlEs } from '../app/shared/paginator-intl.es';

/**
 * Shared test harness for routed pages.
 *
 * Pages are tested with their REAL services: only the HTTP boundary is faked through
 * {@link HttpTestingController}, so a spec exercises page + service + template together, which
 * is closer to what the operator sees than mocking the service. The harness provides what the
 * authenticated shell provides in the app (date adapter, Spanish paginator), a controllable
 * {@link ActivatedRoute} and a signed-in {@link AuthStore} session.
 */
export interface PageHarnessOptions {
  readonly queryParams?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly data?: Record<string, unknown>;
  /** Roles of the signed-in session; `[]` for an anonymous visitor. */
  readonly authorities?: readonly string[];
  readonly providers?: readonly Provider[];
}

export interface PageHarness {
  readonly http: HttpTestingController;
  readonly router: Router;
  /** Spy on Router.navigate (resolves true, never really navigates). */
  readonly navigate: ReturnType<typeof vi.spyOn>;
  /** Replaces the query params, as a URL change would. */
  setQueryParams(params: Record<string, string>): void;
}

// Same as app.config.ts: templates format currency/dates with the es-AR locale.
registerLocaleData(localeEsAr);

export const ADMIN = ['ROLE_ADMIN', 'ROLE_USER'];
export const USER = ['ROLE_USER'];

export function configurePage(options: PageHarnessOptions = {}): PageHarness {
  const snapshot = {
    queryParamMap: convertToParamMap(options.queryParams ?? {}),
    paramMap: convertToParamMap(options.params ?? {}),
    queryParams: { ...(options.queryParams ?? {}) },
    params: { ...(options.params ?? {}) },
    data: options.data ?? {},
  };
  const query$ = new BehaviorSubject<ParamMap>(snapshot.queryParamMap);
  const params$ = new BehaviorSubject<ParamMap>(snapshot.paramMap);
  const route = {
    snapshot,
    queryParamMap: query$.asObservable(),
    paramMap: params$.asObservable(),
    queryParams: new BehaviorSubject(snapshot.queryParams).asObservable(),
    params: new BehaviorSubject(snapshot.params).asObservable(),
    data: new BehaviorSubject(snapshot.data).asObservable(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: route },
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideNativeDateAdapter(),
      { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
      { provide: MatPaginatorIntl, useClass: PaginatorIntlEs },
      ...(options.providers ?? []),
    ],
  });

  const authorities = options.authorities ?? ADMIN;
  const store = TestBed.inject(AuthStore);
  if (authorities.length > 0) {
    store.setSession({
      authorization: 'Bearer test-token',
      expiryDuration: 3_600_000,
      authorities,
    });
  } else {
    store.clear();
  }

  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

  return {
    http: TestBed.inject(HttpTestingController),
    router,
    navigate,
    setQueryParams(params: Record<string, string>) {
      snapshot.queryParamMap = convertToParamMap(params);
      snapshot.queryParams = { ...params };
      query$.next(snapshot.queryParamMap);
    },
  };
}

/** Creates the component and runs the first change detection + effects. */
export function render<T>(component: Type<T>): ComponentFixture<T> {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  TestBed.tick();
  return fixture;
}

/** Re-renders after state changes (signals, flushed responses). */
export function settle<T>(fixture: ComponentFixture<T>): void {
  TestBed.tick();
  fixture.detectChanges();
}

/** A one-page Spring `Page<T>` envelope. */
export function page<T>(content: readonly T[], totalElements = content.length): Page<T> {
  return {
    content,
    number: 0,
    size: 10,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / 10)),
    first: true,
    last: true,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

export type Fixture = readonly [match: string | RegExp, body: unknown];

/**
 * Flushes every pending request. Each request gets the body of the first fixture whose
 * pattern matches its URL (`urlWithParams`), or `fallback` when none does. Repeats until no
 * request is pending (a flushed response may trigger follow-up requests).
 */
export function flushAll(
  http: HttpTestingController,
  fixtures: readonly Fixture[],
  fallback: unknown = [],
): TestRequest[] {
  const flushed: TestRequest[] = [];
  for (let round = 0; round < 10; round++) {
    const pending = http.match(() => true);
    if (pending.length === 0) {
      break;
    }
    for (const req of pending) {
      if (req.cancelled) {
        continue;
      }
      const url = req.request.urlWithParams;
      const hit = fixtures.find(([m]) => (typeof m === 'string' ? url.includes(m) : m.test(url)));
      req.flush((hit ? hit[1] : fallback) as object);
      flushed.push(req);
    }
    TestBed.tick();
  }
  return flushed;
}

/** Text content of the rendered component, whitespace-normalised. */
export function textOf<T>(fixture: ComponentFixture<T>): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
}

type Members = Record<string, unknown>;

/** Invokes a (protected) handler of the page, the way its template would. */
export function call<T>(fixture: ComponentFixture<T>, method: string, ...args: unknown[]): unknown {
  const target = (fixture.componentInstance as unknown as Members)[method];
  if (typeof target !== 'function') {
    throw new Error(`No method ${method} on ${fixture.componentInstance}`);
  }
  return (target as (...a: unknown[]) => unknown).apply(fixture.componentInstance, args);
}

/** Reads a (protected) member of the page; signals are unwrapped. */
export function read<T>(fixture: ComponentFixture<T>, member: string): unknown {
  const value = (fixture.componentInstance as unknown as Members)[member];
  return typeof value === 'function' ? (value as () => unknown)() : value;
}

/** Writes a (protected) writable signal of the page, e.g. the selected row. */
export function setSignal<T>(fixture: ComponentFixture<T>, member: string, value: unknown): void {
  const target = (fixture.componentInstance as unknown as Members)[member] as {
    set: (v: unknown) => void;
  };
  target.set(value);
}

/**
 * Stubs MatDialog.open. `result` is what afterClosed() emits: `true` for a confirmed
 * ConfirmDialog, `undefined` for a dismissed one, or a dialog's return value.
 */
export function stubDialog(result: unknown = undefined): MatDialog {
  const dialog = TestBed.inject(MatDialog);
  vi.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => of(result) } as never);
  return dialog;
}

/** Returns a (protected) member without unwrapping it (arrow-function members, closures). */
export function member<T, M = unknown>(fixture: ComponentFixture<T>, name: string): M {
  return (fixture.componentInstance as unknown as Members)[name] as M;
}

interface ActionLike {
  readonly id: string;
  readonly disabled?: boolean;
  readonly handler?: () => void;
}

/** Clicks every action exposed by a page's `actions` computed (selection-list-card pages). */
export function runActions<T>(fixture: ComponentFixture<T>, ids?: readonly string[]): string[] {
  const actions = read(fixture, 'actions') as readonly ActionLike[];
  const ran: string[] = [];
  for (const action of actions) {
    if (ids && !ids.includes(action.id)) {
      continue;
    }
    action.handler?.();
    ran.push(action.id);
  }
  return ran;
}
