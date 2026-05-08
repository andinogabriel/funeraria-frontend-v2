import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component. Intentionally bare — the visible chrome belongs to the routed
 * components: the login page lives at `/login`, every authenticated route is rendered
 * inside `ShellComponent`. Keeping the root empty lets unauthenticated screens (login,
 * any future public landing page) stay free of toolbar/sidenav clutter.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
