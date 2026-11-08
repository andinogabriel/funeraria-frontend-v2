import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_STATUS_HEADER,
  IDEMPOTENT_RETRY_BASE_DELAY_MS,
  idempotencyInterceptor,
} from './idempotency.interceptor';

describe('idempotencyInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([idempotencyInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    vi.useRealTimers();
  });

  it('stamps a UUID key on mutating API requests', () => {
    http.post('/api/v1/funerals', {}).subscribe();
    const req = controller.expectOne('/api/v1/funerals');
    expect(req.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    req.flush({});
  });

  it('leaves GET requests and non-API URLs untouched', () => {
    http.get('/api/v1/funerals').subscribe();
    http.post('/assets/x.json', {}).subscribe();
    expect(
      controller.expectOne('/api/v1/funerals').request.headers.has(IDEMPOTENCY_KEY_HEADER),
    ).toBe(false);
    expect(controller.expectOne('/assets/x.json').request.headers.has(IDEMPOTENCY_KEY_HEADER)).toBe(
      false,
    );
  });

  it('keeps a key the caller already set', () => {
    http
      .post(
        '/api/v1/incomes',
        {},
        { headers: new HttpHeaders({ [IDEMPOTENCY_KEY_HEADER]: 'caller-key' }) },
      )
      .subscribe();
    expect(
      controller.expectOne('/api/v1/incomes').request.headers.get(IDEMPOTENCY_KEY_HEADER),
    ).toBe('caller-key');
  });

  it('retries a network failure with the SAME key and succeeds', () => {
    let result: unknown;
    http.post('/api/v1/incomes', { a: 1 }).subscribe((r) => (result = r));

    const first = controller.expectOne('/api/v1/incomes');
    const key = first.request.headers.get(IDEMPOTENCY_KEY_HEADER);
    first.error(new ProgressEvent('error'), { status: 0 });

    vi.advanceTimersByTime(IDEMPOTENT_RETRY_BASE_DELAY_MS);
    const second = controller.expectOne('/api/v1/incomes');
    expect(second.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(key);
    second.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('retries a 409 flagged in-progress, with backoff', () => {
    http.post('/api/v1/incomes', {}).subscribe();
    controller.expectOne('/api/v1/incomes').flush(null, {
      status: 409,
      statusText: 'Conflict',
      headers: { [IDEMPOTENCY_STATUS_HEADER]: 'in-progress' },
    });

    vi.advanceTimersByTime(IDEMPOTENT_RETRY_BASE_DELAY_MS);
    controller.expectOne('/api/v1/incomes').flush({});
  });

  it('does not retry client errors such as 400 or a plain 409', () => {
    let failures = 0;
    http.post('/api/v1/incomes', {}).subscribe({ error: () => failures++ });
    controller.expectOne('/api/v1/incomes').flush(null, { status: 409, statusText: 'Conflict' });
    http.post('/api/v1/incomes', {}).subscribe({ error: () => failures++ });
    controller.expectOne('/api/v1/incomes').flush(null, { status: 400, statusText: 'Bad Request' });

    vi.advanceTimersByTime(10_000);
    controller.expectNone('/api/v1/incomes');
    expect(failures).toBe(2);
  });

  it('gives up after the retry budget and surfaces the error', () => {
    let error: unknown;
    http.post('/api/v1/incomes', {}).subscribe({ error: (e) => (error = e) });

    controller.expectOne('/api/v1/incomes').flush(null, { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(IDEMPOTENT_RETRY_BASE_DELAY_MS);
    controller.expectOne('/api/v1/incomes').flush(null, { status: 503, statusText: 'Unavailable' });
    vi.advanceTimersByTime(IDEMPOTENT_RETRY_BASE_DELAY_MS * 2);
    controller.expectOne('/api/v1/incomes').flush(null, { status: 503, statusText: 'Unavailable' });

    expect((error as { status: number }).status).toBe(503);
  });
});
