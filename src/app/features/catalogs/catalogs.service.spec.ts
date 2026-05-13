import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { CatalogsService } from './catalogs.service';
import type { City, Gender, Province } from './catalogs.types';

describe('CatalogsService', () => {
  let service: CatalogsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function province(id: number, name: string): Province {
    return { id, name, code31662: `AR-${String.fromCharCode(64 + id)}` };
  }

  function city(id: number, name: string, prov: Province): City {
    return { id, name, zipCode: `${1000 + id}`, province: prov };
  }

  function gender(id: number, name: string): Gender {
    return { id, name };
  }

  it('fetches provinces on first call and serves the cached value afterwards', () => {
    let firstResult: readonly Province[] | undefined;
    service.loadProvinces().subscribe((result) => (firstResult = result));
    const req = http.expectOne('/api/v1/provinces');
    req.flush([province(1, 'CABA'), province(2, 'Buenos Aires')]);

    expect(firstResult).toEqual([province(1, 'CABA'), province(2, 'Buenos Aires')]);
    expect(service.provinces()).toEqual(firstResult);

    let secondResult: readonly Province[] | undefined;
    service.loadProvinces().subscribe((result) => (secondResult = result));
    // No second HTTP request — the cached signal value is returned synchronously via `of`.
    http.expectNone('/api/v1/provinces');
    expect(secondResult).toBe(firstResult);
  });

  it('bypasses the cache when force=true is passed', () => {
    service.loadProvinces().subscribe();
    http.expectOne('/api/v1/provinces').flush([province(1, 'CABA')]);

    service.loadProvinces({ force: true }).subscribe();
    const refetch = http.expectOne('/api/v1/provinces');
    refetch.flush([province(1, 'CABA'), province(2, 'Buenos Aires')]);

    expect(service.provinces()).toEqual([province(1, 'CABA'), province(2, 'Buenos Aires')]);
  });

  it('passes province_id as a query param and caches cities per province', () => {
    const caba = province(1, 'CABA');
    service.loadCities(1).subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/cities');
    expect(req.request.params.get('province_id')).toBe('1');
    req.flush([city(10, 'CABA centro', caba)]);

    // Re-requesting province 1 hits the cache; requesting a different province fetches.
    service.loadCities(1).subscribe();
    http.expectNone((r) => r.url === '/api/v1/cities' && r.params.get('province_id') === '1');

    service.loadCities(2).subscribe();
    const reqOther = http.expectOne((r) => r.url === '/api/v1/cities');
    expect(reqOther.request.params.get('province_id')).toBe('2');
    reqOther.flush([]);
  });

  it('citiesFor(provinceId) is a derived signal that updates when the cache fills', () => {
    const cabaCities = service.citiesFor(1);
    expect(cabaCities()).toBeNull();

    service.loadCities(1).subscribe();
    const caba = province(1, 'CABA');
    http.expectOne((r) => r.url === '/api/v1/cities').flush([city(10, 'CABA centro', caba)]);

    expect(cabaCities()).toEqual([city(10, 'CABA centro', caba)]);
  });

  it('the simple catalog endpoints (genders, relationships, death-causes, roles) cache the same way', () => {
    service.loadGenders().subscribe();
    http.expectOne('/api/v1/genders').flush([gender(1, 'Femenino'), gender(2, 'Masculino')]);
    expect(service.genders()).toEqual([gender(1, 'Femenino'), gender(2, 'Masculino')]);

    service.loadGenders().subscribe();
    http.expectNone('/api/v1/genders');

    service.loadRelationships().subscribe();
    http.expectOne('/api/v1/relationships').flush([]);

    service.loadDeathCauses().subscribe();
    http.expectOne('/api/v1/death-causes').flush([]);

    service.loadRoles().subscribe();
    http.expectOne('/api/v1/roles').flush([]);
  });

  it('reset() clears every cached catalog so the next load goes back to the network', () => {
    service.loadProvinces().subscribe();
    http.expectOne('/api/v1/provinces').flush([province(1, 'CABA')]);
    service.loadCities(1).subscribe();
    const caba = province(1, 'CABA');
    http.expectOne((r) => r.url === '/api/v1/cities').flush([city(10, 'X', caba)]);
    expect(service.provinces()).not.toBeNull();
    expect(service.citiesFor(1)()).not.toBeNull();

    service.reset();

    expect(service.provinces()).toBeNull();
    expect(service.citiesFor(1)()).toBeNull();
    expect(service.genders()).toBeNull();
    expect(service.relationships()).toBeNull();
    expect(service.deathCauses()).toBeNull();
    expect(service.roles()).toBeNull();
  });
});
