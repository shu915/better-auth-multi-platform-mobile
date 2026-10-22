// The rules for accepting a sign-in link, kept free of React Native and of storage so they can be
// tested on their own. sign-in-link.ts reads and writes the state; this decides.

// `verifier` is the secret that goes with this request (PKCE): the web app was given only its hash
// (the challenge), so a code taken from the link is useless to anyone without it.
export type Pending = { state: string; verifier: string; createdAt: number };

// The web app's magic link lives for 5 minutes by default; allow a little more.
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

// Several requests can be open at once. The web app may send no mail for a repeated request (it
// answers the same either way, so that addresses cannot be probed), so a mail that is already in the
// inbox must stay usable when the user presses "send" again.
export const MAX_PENDING = 3;

export function parsePendingList(raw: string | null): Pending[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const list: Pending[] = [];
    for (const item of value as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const { state, verifier, createdAt } = item as Record<string, unknown>;
      if (
        typeof state === 'string' &&
        state !== '' &&
        typeof verifier === 'string' &&
        isVerifier(verifier) &&
        typeof createdAt === 'number'
      ) {
        list.push({ state, verifier, createdAt });
      }
    }
    return list;
  } catch {
    return [];
  }
}

// RFC 7636: a verifier is 43 to 128 characters of the unreserved set. Ours is 43 (32 random bytes).
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
export const isVerifier = (value: string): boolean => VERIFIER.test(value);

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// base64url without padding (RFC 4648 §5), for the verifier made from random bytes.
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += BASE64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += BASE64URL[n & 63];
  }
  return out;
}

// Standard base64 (what expo-crypto gives for a digest) to base64url, no padding.
export const base64ToBase64Url = (base64: string): string =>
  base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function prune(list: Pending[], now: number): Pending[] {
  return list.filter((p) => now - p.createdAt <= PENDING_MAX_AGE_MS);
}

// A new request: expired ones are dropped, and only the newest MAX_PENDING are kept.
export function addPending(list: Pending[], state: string, verifier: string, now: number): Pending[] {
  return [...prune(list, now), { state, verifier, createdAt: now }].slice(-MAX_PENDING);
}

// A request the web app refused (so no mail with this state exists): only that one is dropped.
export function removePending(list: Pending[], state: string): Pending[] {
  return list.filter((p) => p.state !== state);
}

export type Consumed =
  | { ok: true; rest: Pending[]; pending: Pending } // `state` was one of ours; it is gone from `rest`
  | { ok: false; reason: 'no-request' | 'expired' | 'mismatch'; rest: Pending[] };

// A link comes back with a state. It is accepted only when that is the state of an open request,
// and the request is used up (it is not in `rest`), so the same link cannot be replayed. A state
// that is not ours changes nothing but the removal of expired requests: someone else's link cannot
// cancel a sign-in that is in progress.
export function consumePending(list: Pending[], state: string, now: number): Consumed {
  const open = prune(list, now);
  const found = open.find((p) => p.state === state);
  if (found) return { ok: true, rest: open.filter((p) => p !== found), pending: found };
  if (list.length === 0) return { ok: false, reason: 'no-request', rest: open };
  if (open.length === 0) return { ok: false, reason: 'expired', rest: open };
  return { ok: false, reason: 'mismatch', rest: open };
}

// The redirect is exactly <scheme>:///?state=...&code=...: no host and no path.
export function hasSignInLinkShape(
  parsed: { scheme?: string | null; hostname?: string | null; path?: string | null },
  appScheme: string,
): boolean {
  if (parsed.scheme !== appScheme) return false;
  if (parsed.hostname) return false;
  return !parsed.path || parsed.path === '/';
}

export type LinkVerdict =
  | { kind: 'ignored' } // not a sign-in link: nothing to do
  | { kind: 'rejected'; reason: string }
  | { kind: 'code'; code: string; state: string } // worth trying: check the state, then trade the code

// What to make of a link that opened the app, before anything is read from storage or sent anywhere.
// The order matters and is tested:
//  1. A link with a session in it (`cookie`) is refused. The session is never taken from a link; only
//     an older web app, or someone else's link, puts one there.
//  2. A link with an `error` is refused: the web app turned the sign-in down (no challenge, say).
//  3. A link with no code is not a sign-in link.
//  4. The link must have the shape the web app sends (scheme, no host, no path).
// The `state` is not checked here: that needs the open requests (consumePending).
export function judgeLink(
  parsed: {
    scheme?: string | null;
    hostname?: string | null;
    path?: string | null;
    queryParams?: Record<string, unknown> | null;
  },
  appScheme: string,
): LinkVerdict {
  const params = parsed.queryParams;
  if (typeof params?.cookie === 'string') {
    return { kind: 'rejected', reason: 'a link with a session in it is not accepted' };
  }
  if (typeof params?.error === 'string') {
    return { kind: 'rejected', reason: 'the web app refused the link' };
  }
  const code = params?.code;
  if (typeof code !== 'string' || code === '') return { kind: 'ignored' };
  if (!hasSignInLinkShape(parsed, appScheme)) {
    return { kind: 'rejected', reason: 'unexpected link shape' };
  }
  const state = params?.state;
  return { kind: 'code', code, state: typeof state === 'string' ? state : '' };
}
