import { WEB_URL } from '@/lib/config';

// Trades the one-time code from the sign-in link for the session, at the web app's
// POST /api/mobile/exchange. The web app checks that SHA-256(verifier) is the challenge this app
// sent when it asked for the link, so a code read from a link by another app is useless without
// the verifier (PKCE, RFC 7636). The code is used up by the first try, right or wrong.
// No session exists yet, so there is nothing to send but the two values: credentials omitted.
const TIMEOUT_MS = 10_000;

export type ExchangeResult = { ok: true; cookie: string } | { ok: false; reason: string };

export async function exchangeCode(code: string, verifier: string): Promise<ExchangeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WEB_URL}/api/mobile/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verifier }),
      credentials: 'omit',
      signal: controller.signal,
    });
    // Neither the body nor the values sent are returned or logged: they are the secrets.
    const body: unknown = await res.json().catch(() => null);
    const cookie =
      typeof body === 'object' && body !== null && 'cookie' in body ? body.cookie : undefined;
    if (res.ok && typeof cookie === 'string' && cookie !== '') return { ok: true, cookie };
    return { ok: false, reason: `exchange refused (${res.status})` };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: timedOut ? 'exchange timed out' : 'exchange failed' };
  } finally {
    clearTimeout(timer);
  }
}
