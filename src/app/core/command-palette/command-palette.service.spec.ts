import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';

import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteService } from './command-palette.service';

describe('CommandPaletteService', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('recognises Ctrl+K and Cmd+K, and nothing else', () => {
    const service = TestBed.inject(CommandPaletteService);
    expect(service.isShortcut(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(service.isShortcut(key({ key: 'K', metaKey: true }))).toBe(true);
    expect(service.isShortcut(key({ key: 'k' }))).toBe(false);
    expect(service.isShortcut(key({ key: 'k', ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(service.isShortcut(key({ key: 'k', ctrlKey: true, altKey: true }))).toBe(false);
    expect(service.isShortcut(key({ key: 'j', ctrlKey: true }))).toBe(false);
  });

  it('opens one palette at a time and allows a new one after it closes', () => {
    const closed = new Subject<void>();
    const dialog = TestBed.inject(MatDialog);
    const open = vi
      .spyOn(dialog, 'open')
      .mockReturnValue({ afterClosed: () => closed.asObservable() } as never);
    const service = TestBed.inject(CommandPaletteService);

    service.open();
    service.open();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      CommandPaletteComponent,
      expect.objectContaining({ panelClass: 'app-command-palette-panel' }),
    );

    closed.next();
    service.open();
    expect(open).toHaveBeenCalledTimes(2);
  });
});
