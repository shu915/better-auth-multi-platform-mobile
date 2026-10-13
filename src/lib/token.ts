import { authClient } from '@/lib/auth-client';
import { WEB_URL } from '@/lib/config';

// SPIKE. Gets a JWT for the Go API from the web app (Better Auth's jwt plugin, GET /api/auth/token).
//
// The web app only answers this over HTTP to a request that carries the session token as
// "Authorization: Bearer ..." and NO Cookie header (see isBearerOnly in the web repo). So this is
// a plain fetch, not authClient.token(): expoClient would add the stored cookie as a Cookie header
// to every request it makes, and that request would be refused. credentials: 'omit' keeps the
// phone's own cookie jar out of it too.
const SESSION_TOKEN = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/;

export type JwtResult = { ok: true; token: string } | { ok: false; reason: string };

export async function fetchJwt(): Promise<JwtResult> {
  const cookie = await authClient.getCookie();
  const sessionToken = SESSION_TOKEN.exec(cookie)?.[1];
  if (!sessionToken) return { ok: false, reason: 'no session cookie stored (sign in first)' };
  const res = await fetch(`${WEB_URL}/api/auth/token`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    credentials: 'omit',
  });
  const body: unknown = await res.json().catch(() => null);
  const token = typeof body === 'object' && body !== null && 'token' in body ? body.token : undefined;
  if (res.ok && typeof token === 'string') return { ok: true, token };
  return { ok: false, reason: `${res.status} ${JSON.stringify(body)}` };
}
