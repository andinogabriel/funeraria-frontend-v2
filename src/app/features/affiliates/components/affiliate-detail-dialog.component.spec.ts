import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { affiliate } from '../../../../testing/fixtures';
import type { Affiliate } from '../affiliate.types';
import { AffiliateDetailDialogComponent } from './affiliate-detail-dialog.component';

function render(data: Affiliate): string {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(AffiliateDetailDialogComponent);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('AffiliateDetailDialogComponent', () => {
  it('shows the profile with age, holder, fee and the enrolment date', () => {
    const text = render(affiliate());
    expect(text).toContain('Ana');
    expect(text).toContain('10/05/1980');
    expect(text).toMatch(/\d+ años/);
    expect(text).toContain('Rosa Gomez');
    expect(text).toContain('2.600');
    expect(text).toContain('36-50');
    expect(text).toContain('01/03/2025');
  });

  it('falls back to the record date and hides age and fee when unknown', () => {
    const text = render(
      affiliate({
        birthDate: 'not-a-date',
        enrolmentDate: undefined,
        monthlyFee: null,
        holder: null,
      }),
    );
    expect(text).not.toMatch(/\d+ años/);
    expect(text).toContain('10/01/2026');
    expect(text).not.toContain('Rosa Gomez');
  });

  it('shows the tombstone of a deleted affiliate', () => {
    const text = render(
      affiliate({ deletedAt: '2026-11-01T10:00:00', deletedBy: 'admin@funeraria.local' }),
    );
    expect(text).toContain('Eliminado');
    expect(text).toContain('admin@funeraria.local');
  });

  it('does not report a negative age for a future birth date', () => {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    const iso = next.toISOString().slice(0, 10);
    expect(render(affiliate({ birthDate: iso }))).not.toMatch(/\d+ años/);
  });
});
