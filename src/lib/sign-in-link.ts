import { getSetCookie } from '@better-auth/expo/client';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { APP_SCHEME, STORAGE_PREFIX } from '@/lib/config';
import {
  addPending,
  consumePending,
  hasSignInLinkShape,
  parsePendingList,
  removePending,
  type Pending,
} from '@/lib/sign-in-rules';

// Signing in with a magic link, in two halves that share the list of open requests.
//
//  1. requestSignInLink(email) asks the web app to mail a link. It makes a random `state`, remembers
//     it, and puts it in the callbackURL.
//  2. The mail link is opened in the browser and verified there. The web app then redirects to
//     betterauthmulti:///?state=<state>&cookie=<Set-Cookie> (the expo() plugin appends the cookie).
//     acceptSignInLink(url) takes the cookie out of that deep link.
//
// Any app or web page can open betterauthmulti://..., so a link is only accepted when its `state`
// is one this app made and has not used yet. Otherwise someone could hand the app their own session
// cookie (login CSRF). Each state is used once. A link with a state that is not ours is refused but
// leaves the open requests alone, so it cannot be used to cancel a sign-in. The rules themselves
// (and their tests) are in sign-in-rules.ts.
// A custom scheme can still be registered by another app and read the cookie from a real link. That
// needs Universal Links / App Links (or a one-time code exchange) and is a known limit.
const cookieKey = `${STORAGE_PREFIX}_cookie`; // where expoClient keeps the session cookie
const pendingKey = `${STORAGE_PREFIX}_pending_sign_in`;

const REQUEST_TIMEOUT_MS = 10_000;

async function loadPending(): Promise<Pending[]> {
  return parsePendingList(await SecureStore.getItemAsync(pendingKey));
}

async function savePending(list: Pending[]): Promise<void> {
  if (list.length === 0) await SecureStore.deleteItemAsync(pendingKey);
  else await SecureStore.setItemAsync(pendingKey, JSON.stringify(list));
}

// `status` is the HTTP status when the web app answered (429 is "too many requests").
export type RequestResult = { ok: true } | { ok: false; reason: string; status?: number };

export async function requestSignInLink(email: string): Promise<RequestResult> {
  const state = Crypto.randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Remembered before the request, so a link cannot come back before it is known.
    await savePending(addPending(await loadPending(), state, Date.now()));
    // A path starting with "/" is turned into a link into this app by expoClient.
    const { error } = await authClient.signIn.magicLink(
      { email, callbackURL: `/?state=${state}` },
      { signal: controller.signal },
    );
    if (!error) return { ok: true };
    // The web app answered with an error, so no mail carries this state: forget it, and only it.
    // (An answer is not the same as no answer: on a timeout or a dropped connection the mail may
    // have been sent anyway, so the state stays.)
    if (typeof error.status === 'number' && error.status >= 400) {
      await savePending(removePending(await loadPending(), state));
    }
    return {
      ok: false,
      reason: error.message ?? `request failed (${error.status})`,
      status: error.status,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: timedOut ? 'request timed out' : error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export type AcceptResult =
  | { kind: 'ignored' } // not a sign-in link (no cookie in it)
  | { kind: 'rejected'; reason: string } // looks like one, but is not the link we asked for
  | { kind: 'stored' }
  | { kind: 'failed'; reason: string };

const REFUSED: Record<'no-request' | 'expired' | 'mismatch', string> = {
  'no-request': 'no sign-in was requested from this app',
  expired: 'the request has expired',
  mismatch: 'state does not match',
};

export async function acceptSignInLink(url: string): Promise<AcceptResult> {
  const parsed = Linking.parse(url);
  const cookie = parsed.queryParams?.cookie;
  if (typeof cookie !== 'string' || cookie === '') return { kind: 'ignored' };

  if (!hasSignInLinkShape(parsed, APP_SCHEME)) {
    return { kind: 'rejected', reason: 'unexpected link shape' };
  }

  try {
    const state = parsed.queryParams?.state;
    const result = consumePending(await loadPending(), typeof state === 'string' ? state : '', Date.now());
    // The open requests are saved before anything else: a state that matched is used up here, so the
    // same link cannot be replayed, and requests that expired are dropped.
    await savePending(result.rest);
    if (!result.ok) return { kind: 'rejected', reason: REFUSED[result.reason] };

    const current = await SecureStore.getItemAsync(cookieKey);
    await SecureStore.setItemAsync(cookieKey, getSetCookie(cookie, current ?? undefined));
    // Tell the session hook to fetch the session again with the new cookie.
    authClient.$store.notify('$sessionSignal');
    return { kind: 'stored' };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
