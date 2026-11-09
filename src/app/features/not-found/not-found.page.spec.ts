import { call, configurePage, read, render, USER } from '../../../testing/page-harness';
import { NotFoundPage } from './not-found.page';

describe('NotFoundPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends a signed-in operator back to the dashboard', () => {
    configurePage({ authorities: USER });
    const fixture = render(NotFoundPage);
    expect(read(fixture, 'primaryRoute')).toBe('/dashboard');
    expect(read(fixture, 'primaryLabel')).toBe('Volver al dashboard');
  });

  it('sends an anonymous visitor to the home page', () => {
    configurePage({ authorities: [] });
    const fixture = render(NotFoundPage);
    expect(read(fixture, 'primaryRoute')).toBe('/home');
    expect(read(fixture, 'primaryLabel')).toBe('Volver al inicio');
  });

  it('goes back in history when there is one, else to the primary route', () => {
    const h = configurePage({ authorities: [] });
    const fixture = render(NotFoundPage);
    const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);

    vi.spyOn(history, 'length', 'get').mockReturnValue(3);
    call(fixture, 'goBack');
    expect(back).toHaveBeenCalled();

    vi.spyOn(history, 'length', 'get').mockReturnValue(1);
    call(fixture, 'goBack');
    expect(h.router.navigateByUrl).toHaveBeenCalledWith('/home');
  });
});
