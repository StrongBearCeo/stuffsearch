/**
 * Parse a Supabase auth redirect deep link.
 *
 * `supabase.auth.exchangeCodeForSession(authCode)` takes the **authorization
 * code itself**, not the redirect URL — passing the whole URL posts it as
 * `auth_code`, which the server rejects, and auth-js then deletes the stored
 * PKCE code verifier in its catch block, so every later attempt fails with
 * "PKCE code verifier not found in storage". Extract the `code` param here.
 *
 * Links arrive in several shapes depending on the runtime and on Supabase's
 * canonicalization of the redirect:
 *   stuffsearch://confirm?code=…      (host form)
 *   stuffsearch:///confirm?code=…     (path form)
 *   exp://10.0.0.2:8081/--/confirm?code=…   (Expo Go)
 * and failures come back as query or fragment params instead:
 *   stuffsearch://confirm#error=access_denied&error_description=Email+link+…
 */

export type AuthLink =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string };

/**
 * Collect params from both the query string and the fragment. Supabase puts
 * PKCE codes in the query and some errors in the fragment; a custom-scheme URL
 * is not reliably parseable by `new URL()`, so slice the parts off by hand.
 */
function collectParams(url: string): URLSearchParams {
  const out = new URLSearchParams();
  for (const sep of ['?', '#']) {
    const start = url.indexOf(sep);
    if (start === -1) continue;
    let segment = url.slice(start + 1);
    const end = segment.search(/[?#]/);
    if (end !== -1) segment = segment.slice(0, end);
    for (const [key, value] of new URLSearchParams(segment)) {
      // First occurrence wins: the query is the canonical place for `code`.
      if (!out.has(key)) out.set(key, value);
    }
  }
  return out;
}

/**
 * Returns the auth code to exchange, an error to surface, or `null` when the
 * link is not a Supabase auth redirect at all (e.g. a `stuffsearch://item/…`
 * scan deep link, which must be left for the router to handle).
 */
export function parseAuthDeepLink(url: string | null | undefined): AuthLink | null {
  if (!url) return null;
  const params = collectParams(url);

  // Errors take precedence: when Supabase reports one there is no usable code.
  const description = params.get('error_description');
  const code = params.get('error_code');
  const error = params.get('error');
  if (description || code || error) {
    return { kind: 'error', message: description || code || error || 'Sign-in link failed.' };
  }

  const authCode = params.get('code');
  if (authCode) return { kind: 'code', code: authCode };

  return null;
}
