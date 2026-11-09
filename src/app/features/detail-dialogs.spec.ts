import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { funeral, income, item } from '../../testing/fixtures';
import { FuneralBinDetailDialogComponent } from './funerals/components/funeral-bin-detail-dialog.component';
import { IncomeDetailDialogComponent } from './incomes/components/income-detail-dialog.component';
import { ItemBinDetailDialogComponent } from './items/components/item-bin-detail-dialog.component';
import { ItemDetailDialogComponent } from './items/components/item-detail-dialog.component';

/** Renders a read-only detail dialog with its data and returns the component and its text. */
function open<T>(component: Type<T>, data: unknown): { text: string; c: Record<string, unknown> } {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return {
    text: (fixture.nativeElement as HTMLElement).textContent ?? '',
    c: fixture.componentInstance as unknown as Record<string, unknown>,
  };
}

const value = (c: Record<string, unknown>, name: string) => {
  const member = c[name];
  return typeof member === 'function' ? (member as () => unknown)() : member;
};

describe('ItemDetailDialogComponent', () => {
  it('shows dimensions, the update stamp and the low-stock alarm', () => {
    const { text, c } = open(
      ItemDetailDialogComponent,
      item({ itemLength: 190, stock: 3, lowStockThreshold: 5, updatedAt: '2026-11-02T10:00:00Z' }),
    );
    expect(text).toContain('Cofre Standard');
    expect(value(c, 'hasDimensions')).toBe(true);
    expect(value(c, 'isBelowThreshold')).toBe(true);
    expect(value(c, 'updatedLabel')).not.toBeNull();
  });

  it('hides dimensions and the alarm for an item without stock or measurements', () => {
    const { c } = open(ItemDetailDialogComponent, item({ stock: null }));
    expect(value(c, 'hasDimensions')).toBe(false);
    expect(value(c, 'isBelowThreshold')).toBe(false);
    expect(value(c, 'updatedLabel')).toBeNull();
  });

  it('only checks the width or height when the length is missing', () => {
    expect(value(open(ItemDetailDialogComponent, item({ itemWidth: 60 })).c, 'hasDimensions')).toBe(
      true,
    );
  });
});

describe('ItemBinDetailDialogComponent', () => {
  it('shows the deletion stamp and the dimensions of a deleted item', () => {
    const { c } = open(
      ItemBinDetailDialogComponent,
      item({
        itemHeight: 50,
        deletedAt: '2026-11-05T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
      }),
    );
    expect(value(c, 'deletedAtLabel')).not.toBe('—');
    expect(value(c, 'hasDimensions')).toBe(true);
    expect(value(c, 'updatedLabel')).not.toBeNull();
  });

  it('falls back to dashes without stamps or dimensions', () => {
    const { c } = open(ItemBinDetailDialogComponent, item());
    expect(value(c, 'deletedAtLabel')).toBe('—');
    expect(value(c, 'hasDimensions')).toBe(false);
    expect(value(c, 'updatedLabel')).toBeNull();
  });
});

describe('IncomeDetailDialogComponent', () => {
  it('classifies a live receipt as active', () => {
    expect(value(open(IncomeDetailDialogComponent, income()).c, 'lifecycle')).toBe('active');
  });

  it('marks an annulled original', () => {
    expect(
      value(open(IncomeDetailDialogComponent, income({ status: 'ANNULLED' })).c, 'lifecycle'),
    ).toBe('annulled');
  });

  it('marks a reversal counter-entry and hides a missing modification date', () => {
    const { c } = open(
      IncomeDetailDialogComponent,
      income({ reversalOfId: 9, lastModifiedDate: '' }),
    );
    expect(value(c, 'lifecycle')).toBe('reversal');
    expect(value(c, 'lastModifiedLabel')).toBeNull();
  });
});

describe('FuneralBinDetailDialogComponent', () => {
  it('shows the tax and the deletion stamp', () => {
    const { text, c } = open(
      FuneralBinDetailDialogComponent,
      funeral({ deletedAt: '2026-11-05T10:00:00Z' } as never),
    );
    expect(text).toContain('Perez');
    expect(value(c, 'taxLabel')).toBe('21 %');
    expect(value(c, 'deletedAtLabel')).not.toBe('—');
  });

  it('falls back to dashes without tax or deletion stamp', () => {
    const { c } = open(
      FuneralBinDetailDialogComponent,
      funeral({ tax: null, deletedAt: null } as never),
    );
    expect(value(c, 'taxLabel')).toBe('—');
    expect(value(c, 'deletedAtLabel')).toBe('—');
  });
});
