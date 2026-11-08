import { affiliate, brand, category, income, item, plan, supplier } from './fixtures';
import type { Fixture } from './page-harness';

const named = (id: number, name: string) => ({ id, name });

/**
 * HTTP fixtures for every catalog a form page may load. Specific URLs come before generic ones
 * because {@link flushAll} uses the first matching pattern.
 */
export const FORM_CATALOGS: Fixture[] = [
  [/\/genders/, [named(2, 'Femenino')]],
  [/\/relationships/, [named(1, 'Madre')]],
  [/death-?causes/i, [named(1, 'Natural')]],
  [/receipt-?types/i, [named(1, 'Factura A')]],
  [/\/provinces/, [named(1, 'Buenos Aires')]],
  [/\/cities/, [named(10, 'La Plata')]],
  [/\/brands/, [brand()]],
  [/\/categories/, [category()]],
  [/\/items/, [item()]],
  [/\/plans/, [plan()]],
  [/\/suppliers/, [supplier()]],
  [/\/incomes\/9001/, income()],
  [/\/affiliates/, [affiliate()]],
];

/** A date `days` from today (negative for the past). */
export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
