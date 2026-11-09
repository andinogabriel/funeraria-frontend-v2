import { affiliate, brand, category, income, item, plan, supplier } from './fixtures';
import type { Fixture } from './page-harness';

const named = (id: number, name: string) => ({ id, name });

/** Tariff config with the default tier; the affiliate form loads it for the health-tier select. */
export const TARIFF_CONFIG = {
  baseAmount: 2000,
  maxIssueAge: 85,
  overdueGraceCount: 2,
  healthTiers: [
    {
      id: 1,
      code: 'STANDARD',
      name: 'Estándar',
      healthMultiplier: 1,
      waitingPeriodMonths: 3,
      displayOrder: 1,
    },
  ],
  ageBands: [
    { id: 1, minAge: 36, maxAge: 50, ageMultiplier: 1.3, label: '36-50', displayOrder: 1 },
  ],
};

/** An insurable quote for the default tier. */
export const FEE_QUOTE = {
  insurable: true,
  monthlyFee: 2600,
  age: 46,
  ageBandLabel: '36-50',
  healthTierCode: 'STANDARD',
  healthTierName: 'Estándar',
  waitingPeriodMonths: 3,
  reason: null,
};

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
  [/\/membership\/tariff\/quote/, FEE_QUOTE],
  [/\/membership\/tariff/, TARIFF_CONFIG],
  [/\/affiliates/, [affiliate()]],
];

/** A date `days` from today (negative for the past). */
export const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
