import type { MembershipHolder } from '../affiliates/affiliate.types';

/** A holder in the search results, with what the family pays per month. */
export interface MembershipHolderSummary {
  readonly holder: MembershipHolder;
  readonly activeAffiliates: number;
  readonly monthlyTotal: number;
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';

export type DueStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';

/** One monthly due of an affiliate. Dates are ISO; `period` is `yyyy-MM`. */
export interface MembershipDue {
  readonly id: number;
  readonly affiliateDni: number;
  readonly affiliateName: string;
  readonly period: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly paidAmount: number;
  readonly status: DueStatus;
}

export interface MembershipPayment {
  readonly id: number;
  readonly amount: number;
  /** Part of the payment not applied to any due yet (credit). */
  readonly unallocated: number;
  readonly paidOn: string;
  readonly method: PaymentMethod;
  readonly reference: string | null;
  readonly registeredBy: string;
}

/** Account statement of a holder (`GET /membership/holders/{dni}/account`). */
export interface MembershipAccount {
  readonly holder: MembershipHolder;
  readonly activeAffiliates: number;
  readonly monthlyTotal: number;
  readonly totalBilled: number;
  readonly totalPaid: number;
  readonly outstanding: number;
  readonly credit: number;
  /** `outstanding - credit`: positive is debt, negative is credit. */
  readonly balance: number;
  readonly overdueCount: number;
  readonly dues: readonly MembershipDue[];
  readonly payments: readonly MembershipPayment[];
}

export interface MembershipPaymentRequest {
  readonly amount: number;
  readonly paidOn: string;
  readonly method: PaymentMethod;
  readonly reference?: string;
}

export interface DuesGenerationResult {
  readonly period: string;
  readonly created: number;
  readonly alreadyBilled: number;
  readonly repriced: number;
  readonly unbillable: number;
}

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
};

export const DUE_STATUS_LABELS: Readonly<Record<DueStatus, string>> = {
  PAID: 'Pagada',
  PARTIAL: 'Pago parcial',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencida',
};

/** Pesos with up to two decimals, the format every billing screen uses. */
export function formatArs(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value);
}

/** `yyyy-MM` to "noviembre 2026". */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

/** ISO `yyyy-MM-dd` to `dd/MM/yyyy` without going through `Date` (no timezone shift). */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
