import { authClient } from '@/lib/auth-client';
import { WEB_URL } from '@/lib/config';
import { getSessionToken } from '@/lib/token';

// Changes the user's name through the web app (PATCH /api/mobile/profile): the name lives in the
// web app's database, and Better Auth's own /update-user is refused over HTTP. Authenticated like
// /token: the session token as a Bearer header, no Cookie header, credentials omitted.
const TIMEOUT_MS = 10_000;

export type NameResult =
  | { ok: true; name: string }
  // 401: the session is no longer valid. 422: the web app refused the name (`message` says why).
  | { ok: false; reason: string; status?: number; message?: string };

export async function updateName(name: string): Promise<NameResult> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return { ok: false, reason: 'not signed in', status: 401 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WEB_URL}/api/mobile/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      credentials: 'omit',
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const saved = isRecord(body) ? body.name : undefined;
      if (typeof saved !== 'string') return { ok: false, reason: 'unexpected response' };
      // The session the app holds still has the old name: have it read the user again.
      authClient.$store.notify('$sessionSignal');
      return { ok: true, name: saved };
    }
    return { ok: false, reason: `request failed (${res.status})`, status: res.status, message: messageOf(body) };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: timedOut ? 'request timed out' : 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The reason the web app gave for a 422: { errors: { name: "..." } }.
function messageOf(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.errors)) return undefined;
  return typeof body.errors.name === 'string' ? body.errors.name : undefined;
}
