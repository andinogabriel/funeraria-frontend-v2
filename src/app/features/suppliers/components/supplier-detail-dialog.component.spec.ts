import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { supplier } from '../../../../testing/fixtures';
import type { Supplier } from '../supplier.types';
import { SupplierDetailDialogComponent } from './supplier-detail-dialog.component';

function render(data: Supplier): HTMLElement {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(SupplierDetailDialogComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SupplierDetailDialogComponent', () => {
  it('links the email, adds a scheme to the web page and lists phones and addresses', () => {
    const el = render(
      supplier({
        email: 'ventas@cajones.com',
        webPage: 'cajones.com',
        mobileNumbers: [{ id: 1, mobileNumber: '221-555-0101' }],
        addresses: [
          {
            id: 1,
            streetName: 'Calle 7',
            blockStreet: 1234,
            apartment: 'B',
            flat: '3',
            city: { id: 10, name: 'La Plata' },
          },
          { id: 2, streetName: 'Diagonal 74' },
          { id: 3 },
        ],
      }),
    );
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('mailto:ventas@cajones.com');
    expect(hrefs).toContain('https://cajones.com');
    expect(hrefs).toContain('tel:221-555-0101');
    const text = el.textContent ?? '';
    expect(text).toContain('Calle 7 1234, Dpto B, Piso 3 — La Plata');
    expect(text).toContain('Diagonal 74');
    expect(text).toContain('—');
  });

  it('keeps an explicit scheme on the web page', () => {
    const withScheme = render(supplier({ webPage: 'http://cajones.com' }));
    expect(
      Array.from(withScheme.querySelectorAll('a')).map((a) => a.getAttribute('href')),
    ).toContain('http://cajones.com');
  });

  it('shows dashes when there is no email or web page', () => {
    const el = render(supplier({ email: '', webPage: '  ', mobileNumbers: [], addresses: [] }));
    expect(el.querySelectorAll('a').length).toBe(0);
    expect(el.textContent).not.toContain('Teléfonos');
    expect(el.textContent).not.toContain('Direcciones');
  });
});
