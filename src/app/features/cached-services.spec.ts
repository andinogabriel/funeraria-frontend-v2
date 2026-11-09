import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';

import { brand, category, income, plan, supplier } from '../../testing/fixtures';
import { BrandService } from './brands/brand.service';
import { CategoryService } from './categories/category.service';
import { IncomeService } from './incomes/income.service';
import { PlanService } from './plans/plan.service';
import { SupplierService } from './suppliers/supplier.service';

/**
 * Branches every signal-cached catalog service shares: mutations against a cold cache
 * (no patch), mutations that do not touch the edited row, and the loadAll error messages.
 */
interface CachedService {
  loadAll(): Observable<unknown>;
  create(request: never): Observable<unknown>;
  update(key: never, request: never): Observable<unknown>;
  delete(key: never): Observable<unknown>;
  list(): readonly unknown[] | null;
  error(): string | null;
}

interface Case {
  readonly name: string;
  readonly token: new () => unknown;
  readonly url: string;
  readonly row: () => object;
  readonly other: () => object;
  readonly key: unknown;
  readonly forbidden: string;
}

const cases: readonly Case[] = [
  {
    name: 'BrandService',
    token: BrandService,
    url: '/api/v1/brands',
    row: () => brand({ id: 1 }),
    other: () => brand({ id: 2, name: 'Otra' }),
    key: 1,
    forbidden: 'marcas',
  },
  {
    name: 'CategoryService',
    token: CategoryService,
    url: '/api/v1/categories',
    row: () => category({ id: 1 }),
    other: () => category({ id: 2, name: 'Otra' }),
    key: 1,
    forbidden: 'categorías',
  },
  {
    name: 'SupplierService',
    token: SupplierService,
    url: '/api/v1/suppliers',
    row: () => supplier({ nif: '30-1' }),
    other: () => supplier({ nif: '30-2', name: 'Otra' }),
    key: '30-1',
    forbidden: 'proveedores',
  },
  {
    name: 'PlanService',
    token: PlanService,
    url: '/api/v1/plans',
    row: () => plan({ id: 1 }),
    other: () => plan({ id: 2, name: 'Otro' }),
    key: 1,
    forbidden: 'planes',
  },
];

describe('signal-cached catalog services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  for (const c of cases) {
    describe(c.name, () => {
      const service = () => TestBed.inject(c.token) as unknown as CachedService;
      const isList = (r: { url: string; method: string }) => r.method === 'GET' && r.url === c.url;

      it('does not build a cache from mutations before the first load', () => {
        const s = service();
        s.create({} as never).subscribe();
        http.expectOne((r) => r.method === 'POST').flush(c.row());
        s.update(c.key as never, {} as never).subscribe();
        http.expectOne((r) => r.method === 'PUT').flush(c.row());
        s.delete(c.key as never).subscribe();
        http.expectOne((r) => r.method === 'DELETE').flush(null);
        expect(s.list()).toBeNull();
      });

      it('patches only the edited row of a warm cache', () => {
        const s = service();
        s.loadAll().subscribe();
        http.expectOne(isList).flush([c.row(), c.other()]);
        s.update(c.key as never, {} as never).subscribe();
        http.expectOne((r) => r.method === 'PUT').flush(c.row());
        expect(s.list()?.length).toBe(2);
        expect(s.list()?.[1]).toEqual(c.other());
      });

      it('maps load failures to a message', () => {
        const s = service();
        const fail = (status: number, body: object | null) => {
          s.loadAll().subscribe({ error: () => undefined });
          http.expectOne(isList).flush(body, { status, statusText: 'x' });
          return s.error();
        };
        expect(fail(0, null)).toContain('servidor');
        expect(fail(403, null)).toContain(c.forbidden);
        expect(fail(500, { detail: 'Caído' })).toBe('Caído');
        expect(fail(500, null)).toContain('Ocurrió un error');
      });
    });
  }

  describe('PlanService bin', () => {
    it('sends only the filled filters and maps its failures', () => {
      const s = TestBed.inject(PlanService);
      s.loadDeletedPage({
        page: 0,
        limit: 10,
        name: ' Plan ',
        deletedBy: '  ',
        deletedFrom: '2026-11-01',
        deletedTo: '2026-11-09',
      }).subscribe({ error: () => undefined });
      const req = http.expectOne((r) => r.url === '/api/v1/plans/deleted');
      expect(req.request.params.get('name')).toBe('Plan');
      expect(req.request.params.has('deletedBy')).toBe(false);
      expect(req.request.params.get('deletedFrom')).toBe('2026-11-01');
      expect(req.request.params.get('deletedTo')).toBe('2026-11-09');
      req.flush(null, { status: 403, statusText: 'Forbidden' });
      expect(s.binError()).toContain('planes');
    });
  });

  describe('IncomeService page cache', () => {
    const pageOf = (content: unknown[]) => ({
      content,
      totalElements: content.length,
      totalPages: 1,
      size: 10,
      number: 0,
      first: true,
      last: true,
    });

    it('sends the filled filters, maps failures and patches only the edited receipt', () => {
      const s = TestBed.inject(IncomeService);
      s.update('9001', {} as never).subscribe();
      http.expectOne((r) => r.method === 'PUT').flush(income({ receiptNumber: '9001' }));
      expect(s.page()).toBeNull();

      s.loadPage({ status: 'ACTIVE' as never, receiptNumber: '  ', supplierNif: '30-1' }).subscribe(
        {
          error: () => undefined,
        },
      );
      const failed = http.expectOne((r) => r.url === '/api/v1/incomes/paginated');
      expect(failed.request.params.get('status')).toBe('ACTIVE');
      expect(failed.request.params.has('receiptNumber')).toBe(false);
      expect(failed.request.params.get('supplierNif')).toBe('30-1');
      failed.flush(null, { status: 403, statusText: 'Forbidden' });
      expect(s.error()).toContain('ingresos');

      s.loadPage().subscribe();
      http
        .expectOne((r) => r.url === '/api/v1/incomes/paginated')
        .flush(pageOf([income({ receiptNumber: '9001' }), income({ receiptNumber: '9002' })]));

      s.update('7777', {} as never).subscribe();
      http.expectOne((r) => r.method === 'PUT').flush(income({ receiptNumber: '7777' }));
      expect(s.rows().map((r) => r.receiptNumber)).toEqual(['9001', '9002']);

      s.update('9002', {} as never).subscribe();
      http.expectOne((r) => r.method === 'PUT').flush(income({ receiptNumber: '9002', tax: 5 }));
      expect(s.rows()[1].tax).toBe(5);
    });
  });
});
