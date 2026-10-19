import { API_URL } from '@/lib/config';
import { fetchJwt } from '@/lib/token';

// Calls to the Go API. The JWT comes from fetchJwt on every call (it is never kept). The API takes
// the user from the token's `sub` only, so there is no user id to send.
const TIMEOUT_MS = 10_000;

export type Profile = { userId: string; bio: string };

export type ApiResult<T> =
  | { ok: true; data: T }
  // `status` is set when the API answered. 401 means the session or the JWT is no longer valid.
  | { ok: false; reason: string; status?: number };

async function request(path: string, init: { method: string; body?: unknown }) {
  const jwt = await fetchJwt();
  if (!jwt.ok) return { ok: false, reason: jwt.reason } as const;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${jwt.token}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `request failed (${res.status})`, status: res.status } as const;
    const json: unknown = await res.json().catch(() => null);
    return { ok: true, json } as const;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: timedOut ? 'request timed out' : 'request failed' } as const;
  } finally {
    clearTimeout(timer);
  }
}

// What the API sent is checked before it is trusted as a Profile.
function toProfile(json: unknown): Profile | null {
  if (typeof json !== 'object' || json === null) return null;
  const { user_id: userId, bio } = json as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof bio !== 'string') return null;
  return { userId, bio };
}

async function profileFrom(
  response: Awaited<ReturnType<typeof request>>,
): Promise<ApiResult<Profile>> {
  if (!response.ok) return response;
  const profile = toProfile(response.json);
  return profile ? { ok: true, data: profile } : { ok: false, reason: 'unexpected response' };
}

export async function getProfile(): Promise<ApiResult<Profile>> {
  return profileFrom(await request('/me/profile', { method: 'GET' }));
}

// Replaces the bio. The API refuses more than 1000 characters, NUL characters and invalid UTF-8
// (422); the screen limits the length too, but the API is the one that decides.
export async function updateBio(bio: string): Promise<ApiResult<Profile>> {
  return profileFrom(await request('/me/profile', { method: 'PUT', body: { bio } }));
}
