// The rules for accepting a sign-in link, kept free of React Native and of storage so they can be
// tested on their own. sign-in-link.ts reads and writes the state; this decides.

export type Pending = { state: string; createdAt: number };

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
      const { state, createdAt } = item as Record<string, unknown>;
      if (typeof state === 'string' && state !== '' && typeof createdAt === 'number') {
        list.push({ state, createdAt });
      }
    }
    return list;
  } catch {
    return [];
  }
}

function prune(list: Pending[], now: number): Pending[] {
  return list.filter((p) => now - p.createdAt <= PENDING_MAX_AGE_MS);
}

// A new request: expired ones are dropped, and only the newest MAX_PENDING are kept.
export function addPending(list: Pending[], state: string, now: number): Pending[] {
  return [...prune(list, now), { state, createdAt: now }].slice(-MAX_PENDING);
}

// A request the web app refused (so no mail with this state exists): only that one is dropped.
export function removePending(list: Pending[], state: string): Pending[] {
  return list.filter((p) => p.state !== state);
}

export type Consumed =
  | { ok: true; rest: Pending[] } // `state` was one of ours; it is gone from `rest`
  | { ok: false; reason: 'no-request' | 'expired' | 'mismatch'; rest: Pending[] };

// A link comes back with a state. It is accepted only when that is the state of an open request,
// and the request is used up (it is not in `rest`), so the same link cannot be replayed. A state
// that is not ours changes nothing but the removal of expired requests: someone else's link cannot
// cancel a sign-in that is in progress.
export function consumePending(list: Pending[], state: string, now: number): Consumed {
  const open = prune(list, now);
  const found = open.find((p) => p.state === state);
  if (found) return { ok: true, rest: open.filter((p) => p !== found) };
  if (list.length === 0) return { ok: false, reason: 'no-request', rest: open };
  if (open.length === 0) return { ok: false, reason: 'expired', rest: open };
  return { ok: false, reason: 'mismatch', rest: open };
}

// The redirect is exactly <scheme>:///?state=...&cookie=...: no host and no path.
export function hasSignInLinkShape(
  parsed: { scheme?: string | null; hostname?: string | null; path?: string | null },
  appScheme: string,
): boolean {
  if (parsed.scheme !== appScheme) return false;
  if (parsed.hostname) return false;
  return !parsed.path || parsed.path === '/';
}
