import type { FormGroup } from '@angular/forms';

import {
  call,
  configurePage,
  member,
  read,
  render,
  settle,
  type PageHarness,
} from '../../../../testing/page-harness';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let h: PageHarness;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams, authorities: [] });
    return render(LoginPage);
  }
  const form = (f: ReturnType<typeof setup>) => member<LoginPage, FormGroup>(f, 'form');

  afterEach(() => h.http.verify());

  it('signs in and goes to the return URL', () => {
    const fixture = setup({ returnUrl: '/items' });
    form(fixture).patchValue({ email: 'admin@funeraria.local', password: 'Admin123!' });
    call(fixture, 'onSubmit');
    const req = h.http.expectOne((r) => r.url.endsWith('/users/login'));
    expect(req.request.body.deviceInfo.deviceId).toBeTruthy();
    req.flush({
      authorization: 'Bearer t',
      refreshToken: 'r',
      expiryDuration: 60_000,
      authorities: ['ROLE_ADMIN'],
    });
    settle(fixture);
    expect(h.router.navigateByUrl).toHaveBeenCalledWith('/items');
  });

  it('shows a friendly message on bad credentials and on network errors', () => {
    const fixture = setup();
    form(fixture).patchValue({ email: 'admin@funeraria.local', password: 'wrong-password' });
    call(fixture, 'onSubmit');
    h.http
      .expectOne((r) => r.url.endsWith('/users/login'))
      .flush({ detail: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();

    call(fixture, 'onSubmit');
    h.http
      .expectOne((r) => r.url.endsWith('/users/login'))
      .error(new ProgressEvent('error'), { status: 0 });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('rejects an invalid form and toggles password visibility', () => {
    const fixture = setup();
    call(fixture, 'onSubmit');
    h.http.expectNone((r) => r.url.endsWith('/users/login'));
    const before = read(fixture, 'showPassword');
    call(fixture, 'toggleShowPassword');
    expect(read(fixture, 'showPassword')).toBe(!before);
  });
});
