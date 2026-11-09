import type { FormGroup } from '@angular/forms';

import {
  call,
  configurePage,
  member,
  read,
  render,
  settle,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { MembershipAccount } from '../billing.types';
import { HolderAccountPage } from './holder-account.page';

const ACCOUNT: MembershipAccount = {
  holder: {
    id: 7,
    dni: 20111222,
    firstName: 'Rosa',
    lastName: 'Gomez',
    phone: '221-555-0000',
    email: 'rosa@mail.com',
  },
  activeAffiliates: 2,
  monthlyTotal: 5200,
  totalBilled: 10400,
  totalPaid: 6000,
  outstanding: 4400,
  credit: 0,
  balance: 4400,
  overdueCount: 1,
  dues: [
    {
      id: 1,
      affiliateDni: 40111222,
      affiliateName: 'Ana Gomez',
      period: '2026-10',
      dueDate: '2026-10-10',
      amount: 2600,
      paidAmount: 2600,
      status: 'PAID',
    },
    {
      id: 2,
      affiliateDni: 40111222,
      affiliateName: 'Ana Gomez',
      period: '2026-11',
      dueDate: '2026-11-10',
      amount: 2600,
      paidAmount: 800,
      status: 'OVERDUE',
    },
    {
      id: 3,
      affiliateDni: 40111223,
      affiliateName: 'Juan Gomez',
      period: '2026-11',
      dueDate: '2026-11-10',
      amount: 2600,
      paidAmount: 0,
      status: 'PENDING',
    },
  ],
  payments: [
    {
      id: 1,
      amount: 6000,
      unallocated: 0,
      paidOn: '2026-10-05',
      method: 'TRANSFER',
      reference: 'OP-123',
      registeredBy: 'admin@funeraria.local',
    },
  ],
};

describe('HolderAccountPage', () => {
  let h: PageHarness;

  function setup(dni = '20111222') {
    h = configurePage({ params: { dni } });
    const fixture = render(HolderAccountPage);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) =>
    member<HolderAccountPage, FormGroup>(f, 'paymentForm');

  afterEach(() => h.http.verify());

  it('renders the statement: totals, dues newest first and payments', () => {
    const fixture = setup();
    h.http.expectOne((r) => r.url.endsWith('/holders/20111222/account')).flush(ACCOUNT);
    settle(fixture);

    const text = textOf(fixture);
    expect(text).toContain('Rosa Gomez');
    expect(text).toContain('Deuda');
    expect(text).toContain('Vencida');
    expect(text).toContain('Transferencia');
    expect(text).toContain('OP-123');
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="dues-table"] tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Juan Gomez');
    expect(call(fixture, 'statusClass', 'PAID')).toContain('secondary');
    expect(call(fixture, 'statusClass', 'PARTIAL')).toContain('surface');
  });

  it('shows credit instead of debt and an empty history', () => {
    const fixture = setup();
    h.http
      .expectOne((r) => r.url.endsWith('/account'))
      .flush({ ...ACCOUNT, balance: -800, credit: 800, dues: [], payments: [] });
    settle(fixture);

    const text = textOf(fixture);
    expect(text).toContain('Saldo a favor');
    expect(text).toContain('Todavía no se generaron cuotas');
    expect(text).toContain('Sin pagos registrados.');
  });

  it('registers a payment, replaces the statement and resets the form', () => {
    const fixture = setup();
    h.http.expectOne((r) => r.url.endsWith('/account')).flush(ACCOUNT);
    settle(fixture);

    call(fixture, 'onPayBalance');
    expect(form(fixture).getRawValue().amount).toBe(4400);
    form(fixture).patchValue({ method: 'CARD', reference: '  ' });
    call(fixture, 'onRegisterPayment');
    const req = h.http.expectOne((r) => r.url.endsWith('/holders/20111222/payments'));
    expect(req.request.body).toEqual({
      amount: 4400,
      paidOn: read(fixture, 'today'),
      method: 'CARD',
    });
    req.flush({ ...ACCOUNT, balance: 0, outstanding: 0, overdueCount: 0 });
    settle(fixture);

    expect((read(fixture, 'account') as MembershipAccount).balance).toBe(0);
    expect(form(fixture).getRawValue().amount).toBeNull();
  });

  it('keeps the form when the payment is rejected and blocks an invalid one', () => {
    const fixture = setup();
    h.http.expectOne((r) => r.url.endsWith('/account')).flush(ACCOUNT);
    settle(fixture);

    call(fixture, 'onRegisterPayment');
    h.http.expectNone((r) => r.url.endsWith('/payments'));

    form(fixture).patchValue({ amount: 100, reference: 'REC-1' });
    call(fixture, 'onRegisterPayment');
    const req = h.http.expectOne((r) => r.url.endsWith('/payments'));
    expect(req.request.body.reference).toBe('REC-1');
    req.flush({ detail: 'error' }, { status: 500, statusText: 'Error' });
    expect(form(fixture).getRawValue().amount).toBe(100);
    expect(read(fixture, 'saving')).toBe(false);
  });

  it('reports an unknown holder', () => {
    const fixture = setup();
    h.http
      .expectOne((r) => r.url.endsWith('/account'))
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(read(fixture, 'error')).toBe('No existe un titular con ese DNI.');
  });

  it('reports a failed load', () => {
    const fixture = setup();
    h.http
      .expectOne((r) => r.url.endsWith('/account'))
      .flush({}, { status: 500, statusText: 'Error' });
    expect(read(fixture, 'error')).toBe('No se pudo cargar el estado de cuenta.');
  });

  it('rejects an invalid DNI without calling the backend', () => {
    const fixture = setup('abc');
    expect(read(fixture, 'error')).toBe('DNI de titular inválido.');
  });
});
