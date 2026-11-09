import { TestBed } from '@angular/core/testing';

import type { ClaimEligibility } from '../billing.types';
import { CoverageVerdictComponent } from './coverage-verdict.component';

const evaluation = (o: Partial<ClaimEligibility> = {}): ClaimEligibility => ({
  affiliateDni: 30111222,
  affiliateName: 'Ana Perez',
  holder: null,
  healthTierName: 'Estandar',
  evaluatedOn: '2026-11-09',
  accidental: false,
  eligible: true,
  reasons: [],
  waitingPeriodMonths: 3,
  coveredFrom: '2026-02-01',
  overdueCount: 1,
  overdueGraceCount: 2,
  ...o,
});

function render(
  eligible: boolean,
  reasons: readonly string[] = [],
  detail: ClaimEligibility | null = null,
): string {
  const fixture = TestBed.createComponent(CoverageVerdictComponent);
  fixture.componentRef.setInput('eligible', eligible);
  fixture.componentRef.setInput('reasons', reasons);
  fixture.componentRef.setInput('detail', detail);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('CoverageVerdictComponent', () => {
  it('shows a covered verdict with the waiting period and arrears detail', () => {
    const text = render(true, [], evaluation());
    expect(text).toContain('Cubierto por la membresía');
    expect(text).toContain('cubierto desde');
    expect(text).toContain('01/02/2026');
    expect(text).toContain('Cuotas vencidas: 1 (tolera 2)');
  });

  it('lists every reason of a non-covered verdict, with unknown codes as-is', () => {
    const text = render(false, ['WAITING_PERIOD', 'ACCOUNT_IN_ARREARS', 'SOMETHING_NEW']);
    expect(text).toContain('No cubierto por la membresía');
    expect(text).toContain('período de carencia');
    expect(text).toContain('cuotas en mora');
    expect(text).toContain('SOMETHING_NEW');
    expect(text).not.toContain('Cuotas vencidas');
  });

  it('explains that an accidental death skips the waiting period', () => {
    const text = render(true, [], evaluation({ accidental: true }));
    expect(text).toContain('Muerte accidental: sin carencia.');
    expect(text).not.toContain('Carencia de');
  });
});
