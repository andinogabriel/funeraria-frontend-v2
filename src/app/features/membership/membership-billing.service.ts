import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  DuesGenerationResult,
  MembershipAccount,
  MembershipHolderSummary,
  MembershipPaymentRequest,
} from './billing.types';

/**
 * Client for membership billing (backend ADR-0021): holder search, account statements, payment
 * registration and dues generation. Stateless: every screen owns the data it shows, because a
 * statement is only meaningful for the holder on screen.
 */
@Injectable({ providedIn: 'root' })
export class MembershipBillingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/membership`;

  searchHolders(search: string): Observable<MembershipHolderSummary[]> {
    const params = new HttpParams().set('search', search);
    return this.http.get<MembershipHolderSummary[]>(`${this.baseUrl}/holders`, { params });
  }

  statement(dni: number): Observable<MembershipAccount> {
    return this.http.get<MembershipAccount>(`${this.baseUrl}/holders/${dni}/account`);
  }

  /** Registers a payment; the server answers with the updated statement. */
  registerPayment(dni: number, request: MembershipPaymentRequest): Observable<MembershipAccount> {
    return this.http.post<MembershipAccount>(`${this.baseUrl}/holders/${dni}/payments`, request);
  }

  /** Bills `period` (`yyyy-MM`) for every affiliate not billed yet. Idempotent. */
  generateDues(period: string): Observable<DuesGenerationResult> {
    return this.http.post<DuesGenerationResult>(`${this.baseUrl}/dues/generate`, { period });
  }
}
