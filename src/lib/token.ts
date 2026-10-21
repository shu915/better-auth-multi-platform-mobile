import { authClient } from '@/lib/auth-client';
import { WEB_URL } from '@/lib/config';

// Gets a JWT for the Go API from the web app (Better Auth's jwt plugin, GET /api/auth/token).
//
// The web app only answers this over HTTP to a request that carries the session token as
// "Authorization: Bearer ..." and NO Cookie header (see isBearerOnly in the web repo). So this is
// a plain fetch, not authClient.token(): expoClient would add the stored cookie as a Cookie header
// to every request it makes, and that request would be refused. credentials: 'omit' keeps the
// phone's own cookie jar out of it too.
//
// The JWT is short-lived (5 minutes) and is fetched on every call: it is never stored, so there is
// nothing to expire or to leak from disk. The caller uses it right away and drops it.
const SESSION_TOKEN = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/;
const TIMEOUT_MS = 10_000;

// `status` is set when the web app answered. 401 there means the session is no longer valid.
export type JwtResult = { ok: true; token: string } | { ok: false; reason: string; status?: number };

// The signed session token from the stored cookie, to send as "Authorization: Bearer ..." (and
// never as a Cookie header: the web app refuses a bearer token that comes with a Cookie).
export async function getSessionToken(): Promise<string | undefined> {
  return SESSION_TOKEN.exec(await authClient.getCookie())?.[1];
}

export async function fetchJwt(): Promise<JwtResult> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return { ok: false, reason: 'not signed in' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WEB_URL}/api/auth/token`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      credentials: 'omit',
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    const token =
      typeof body === 'object' && body !== null && 'token' in body ? body.token : undefined;
    if (res.ok && typeof token === 'string' && token !== '') return { ok: true, token };
    // The body is not logged or returned: it may hold a token or a message meant for the server.
    return { ok: false, reason: `token request failed (${res.status})`, status: res.status };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: timedOut ? 'token request timed out' : 'token request failed' };
  } finally {
    clearTimeout(timer);
  }
}
