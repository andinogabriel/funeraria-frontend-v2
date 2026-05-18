import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/theme/theme.service';

/**
 * Root component. Intentionally bare — the visible chrome belongs to the routed
 * components: the login page lives at `/login`, every authenticated route is rendered
 * inside `ShellComponent`. Keeping the root empty lets unauthenticated screens (login,
 * any future public landing page) stay free of toolbar/sidenav clutter.
 *
 * `ThemeService` is injected here (rather than in the shell) so the theme effect
 * runs even on the public surfaces (login). Without this the toolbar override on
 * `/login` would not stick.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // Eager injection: trigger the ThemeService constructor at bootstrap so its
  // class-mirroring effect starts running before any page renders.
  private readonly theme = inject(ThemeService);
}
