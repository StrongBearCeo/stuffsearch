import { parseAuthDeepLink } from '../authLink';

describe('parseAuthDeepLink', () => {
  it('extracts the code from the host form Supabase actually sends', () => {
    // This is the regression: the whole URL used to be passed to
    // exchangeCodeForSession, which the server rejects.
    expect(parseAuthDeepLink('stuffsearch://confirm?code=34e770dd-9ff9-416c-87fa-43b31d7ef225')).toEqual(
      { kind: 'code', code: '34e770dd-9ff9-416c-87fa-43b31d7ef225' }
    );
  });

  it('extracts the code from the path form we send as emailRedirectTo', () => {
    expect(parseAuthDeepLink('stuffsearch:///confirm?code=abc123')).toEqual({
      kind: 'code',
      code: 'abc123',
    });
  });

  it('extracts the code from an Expo Go dev URL', () => {
    expect(parseAuthDeepLink('exp://192.168.1.5:8081/--/confirm?code=abc123')).toEqual({
      kind: 'code',
      code: 'abc123',
    });
  });

  it('keeps the code when other params surround it', () => {
    expect(parseAuthDeepLink('stuffsearch://confirm?foo=1&code=abc123&bar=2')).toEqual({
      kind: 'code',
      code: 'abc123',
    });
  });

  it('surfaces an expired-link error from the fragment', () => {
    const link = parseAuthDeepLink(
      'stuffsearch://confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(link).toEqual({ kind: 'error', message: 'Email link is invalid or has expired' });
  });

  it('surfaces an error from the query string too', () => {
    expect(parseAuthDeepLink('stuffsearch://confirm?error=access_denied')).toEqual({
      kind: 'error',
      message: 'access_denied',
    });
  });

  it('prefers the error over a code when both somehow appear', () => {
    const link = parseAuthDeepLink('stuffsearch://confirm?code=abc123&error_description=nope');
    expect(link).toEqual({ kind: 'error', message: 'nope' });
  });

  it('falls back to error_code when no description is given', () => {
    expect(parseAuthDeepLink('stuffsearch://confirm?error_code=otp_expired')).toEqual({
      kind: 'error',
      message: 'otp_expired',
    });
  });

  it('ignores non-auth deep links so the router can handle them', () => {
    expect(parseAuthDeepLink('stuffsearch://item/123')).toBeNull();
    expect(parseAuthDeepLink('stuffsearch://place/abc?tab=contents')).toBeNull();
  });

  it('handles null, undefined and empty input', () => {
    expect(parseAuthDeepLink(null)).toBeNull();
    expect(parseAuthDeepLink(undefined)).toBeNull();
    expect(parseAuthDeepLink('')).toBeNull();
  });

  it('does not mistake a substring like "barcode=" for the code param', () => {
    expect(parseAuthDeepLink('stuffsearch://scan?barcode=999')).toBeNull();
  });

  it('percent-decodes the code', () => {
    expect(parseAuthDeepLink('stuffsearch://confirm?code=a%2Bb')).toEqual({
      kind: 'code',
      code: 'a+b',
    });
  });
});
