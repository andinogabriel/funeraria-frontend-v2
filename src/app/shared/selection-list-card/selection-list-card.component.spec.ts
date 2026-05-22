import { Component, ViewChild, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import type { DataTableColumn, DataTableColumnFilterValue } from '../data-table';
import { SelectionListCardComponent } from './selection-list-card.component';
import type { ListCardAction } from './selection-list-card.types';

interface Row {
  readonly id: number;
  readonly name: string;
  readonly birthdate: string; // ISO yyyy-mm-dd
}

/** Host wires up the inputs the way a real call site would. */
@Component({
  imports: [SelectionListCardComponent],
  template: `
    <app-selection-list-card
      [data]="rows"
      [columns]="columns"
      [actions]="actions"
      [loading]="loading"
      [(selectedRow)]="selected"
    />
  `,
})
class HostComponent {
  rows: readonly Row[] = [];
  columns: readonly DataTableColumn<Row>[] = [
    { key: 'id', label: 'ID', value: (r) => r.id, hideable: false },
    { key: 'name', label: 'Nombre', value: (r) => r.name, filter: 'text' },
    { key: 'birthdate', label: 'Nacimiento', value: (r) => r.birthdate, filter: 'dateRange' },
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
    TestBed.configureTestingModule({
      imports: [HostComponent, NoopAnimationsModule],
      providers: [provideNativeDateAdapter()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.rows = [
      { id: 1, name: 'Alfa', birthdate: '1990-01-15' },
      { id: 2, name: 'Beta', birthdate: '1995-06-20' },
      { id: 3, name: 'Cárlos', birthdate: '2000-12-30' },
    ];
    fixture.detectChanges();
    window.localStorage.clear();
  });

  function api() {
    return host.card as unknown as {
      readonly committedFilters: () => ReadonlyMap<string, DataTableColumnFilterValue>;
      readonly filteredData: () => readonly Row[];
      readonly effectiveEmptyState: () => { icon: string; title: string; body?: string };
      readonly hasCommittedFilters: () => boolean;
      onColumnMenuApply(event: { key: string; filter: DataTableColumnFilterValue | null }): void;
      onClearFilters(): void;
    };
  }

  it('starts unfiltered — every row passes through filteredData', () => {
    expect(api().filteredData()).toHaveLength(3);
    expect(api().committedFilters().size).toBe(0);
  });

  it('applies a text filter case-insensitively and ignoring diacritics', () => {
    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'cArl' } });
    fixture.detectChanges();
    expect(
      api()
        .filteredData()
        .map((r) => r.name),
    ).toEqual(['Cárlos']);
  });

  it('drops a committed filter when columnMenuApply fires with filter: null', () => {
    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'alfa' } });
    fixture.detectChanges();
    expect(api().filteredData()).toHaveLength(1);

    api().onColumnMenuApply({ key: 'name', filter: null });
    fixture.detectChanges();
    expect(api().filteredData()).toHaveLength(3);
  });

  it('applies a dateRange filter inclusive on both ends', () => {
    api().onColumnMenuApply({
      key: 'birthdate',
      filter: { type: 'dateRange', from: '1992-01-01', to: '1996-01-01' },
    });
    fixture.detectChanges();
    expect(
      api()
        .filteredData()
        .map((r) => r.name),
    ).toEqual(['Beta']);
  });

  it('combines multiple committed filters with AND semantics', () => {
    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'a' } });
    api().onColumnMenuApply({
      key: 'birthdate',
      filter: { type: 'dateRange', from: '1994-01-01', to: null },
    });
    fixture.detectChanges();
    // "a" matches Alfa, Beta, Cárlos. Birth from 1994-onwards drops Alfa.
    expect(
      api()
        .filteredData()
        .map((r) => r.name),
    ).toEqual(['Beta', 'Cárlos']);
  });

  it('builds the data-table emptyState payload from the icon / title / hint inputs', () => {
    const payload = api().effectiveEmptyState();
    expect(payload.icon).toBe('search_off');
    expect(payload.title).toBe('No hay resultados.');
    expect(payload.body).toBe('Probá con otro criterio de búsqueda.');
  });

  it('forwards selection through the model binding to the host signal', () => {
    host.card.selectedRow.set(host.rows[1]);
    fixture.detectChanges();
    expect(host.selected()).toEqual(host.rows[1]);
  });

  it('clears the selection when a committed filter excludes the selected row', () => {
    host.card.selectedRow.set(host.rows[0]); // Alfa
    fixture.detectChanges();
    expect(host.selected()).toEqual(host.rows[0]);

    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'beta' } });
    fixture.detectChanges();
    expect(host.selected()).toBeNull();
  });

  it('flips hasCommittedFilters as filters are added and removed', () => {
    expect(api().hasCommittedFilters()).toBe(false);

    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'alfa' } });
    fixture.detectChanges();
    expect(api().hasCommittedFilters()).toBe(true);

    api().onColumnMenuApply({ key: 'name', filter: null });
    fixture.detectChanges();
    expect(api().hasCommittedFilters()).toBe(false);
  });

  it('onClearFilters wipes every committed filter in a single action', () => {
    api().onColumnMenuApply({ key: 'name', filter: { type: 'text', value: 'a' } });
    api().onColumnMenuApply({
      key: 'birthdate',
      filter: { type: 'dateRange', from: '1990-01-01', to: '2000-01-01' },
    });
    fixture.detectChanges();
    expect(api().committedFilters().size).toBe(2);

    api().onClearFilters();
    fixture.detectChanges();
    expect(api().committedFilters().size).toBe(0);
    expect(api().filteredData()).toHaveLength(3);
  });
});
