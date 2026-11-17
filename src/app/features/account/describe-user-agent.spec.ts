import { describeUserAgent } from './describe-user-agent';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Chrome',
      'Windows',
      false,
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
      'Edge',
      'Windows',
      false,
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
      'Firefox',
      'Linux',
      false,
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
      'Safari',
      'macOS',
      false,
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      'Safari',
      'iOS',
      true,
    ],
    [
      'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36',
      'Chrome',
      'Android',
      true,
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36 OPR/120.0',
      'Opera',
      'ChromeOS',
      false,
    ],
  ])('reads %s', (ua, browser, os, mobile) => {
    expect(describeUserAgent(ua)).toEqual({ browser, os, mobile });
  });

  it('falls back to unknown values for a missing or odd User-Agent', () => {
    expect(describeUserAgent(null)).toEqual({
      browser: 'Navegador desconocido',
      os: 'sistema desconocido',
      mobile: false,
    });
    expect(describeUserAgent('curl/8.0')).toEqual({
      browser: 'Navegador desconocido',
      os: 'sistema desconocido',
      mobile: false,
    });
  });
});
