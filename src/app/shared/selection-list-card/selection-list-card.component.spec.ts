import { Component, ViewChild, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import type { DataTableColumn } from '../data-table';
import { SelectionListCardComponent } from './selection-list-card.component';
import type { ListCardAction } from './selection-list-card.types';

interface Row {
  readonly id: number;
  readonly name: string;
}

/** Host wires up the inputs the way a real call site would, without re-implementing search debouncing. */
@Component({
  imports: [SelectionListCardComponent],
  template: `
    <app-selection-list-card
      [searchControl]="search"
      [data]="rows"
      [columns]="columns"
      [actions]="actions"
      [loading]="loading"
      [(selectedRow)]="selected"
    />
  `,
})
class HostComponent {
  readonly search = new FormControl('', { nonNullable: true });
  rows: readonly Row[] = [];
  columns: readonly DataTableColumn<Row>[] = [
    { key: 'id', label: 'ID', value: (r) => r.id, hideable: false },
    { key: 'name', label: 'Nombre', value: (r) => r.name },
  ];
  actions: readonly ListCardAction[] = [];
  loading = false;
  readonly selected = signal<Row | null>(null);

  @ViewChild(SelectionListCardComponent) card!: SelectionListCardComponent<Row>;
}

describe('SelectionListCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent, NoopAnimationsModule] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.rows = [
      { id: 1, name: 'Alfa' },
      { id: 2, name: 'Beta' },
    ];
    fixture.detectChanges();
    window.localStorage.clear();
  });

  it('marks hasSearchValue true once the form control holds a non-empty string', () => {
    expect(host.card['hasSearchValue']()).toBe(false);

    host.search.setValue('alfa');
    fixture.detectChanges();
    expect(host.card['hasSearchValue']()).toBe(true);

    host.search.setValue('');
    fixture.detectChanges();
    expect(host.card['hasSearchValue']()).toBe(false);
  });

  it('clears the search FormControl when onClearSearch fires', () => {
    host.search.setValue('something');
    fixture.detectChanges();

    host.card['onClearSearch']();
    expect(host.search.value).toBe('');
  });

  it('seeds hasSearchValue from the form control on construction', () => {
    // Spin up a fresh fixture so the initial value gets seeded BEFORE the first
    // detect cycle — the shared `beforeEach` builds a fixture with an empty
    // FormControl, which already verified the zero-state case in the test above.
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.search.setValue('already there');
    f.detectChanges();

    expect(f.componentInstance.card['hasSearchValue']()).toBe(true);
  });

  it('forwards selection through the model binding to the host signal', () => {
    const table = host.card as unknown as { selectedRow: { set: (v: Row | null) => void } };
    table.selectedRow.set(host.rows[1]);
    fixture.detectChanges();

    expect(host.selected()).toEqual(host.rows[1]);
  });
});
