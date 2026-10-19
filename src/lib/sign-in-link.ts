import { getSetCookie } from '@better-auth/expo/client';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { APP_SCHEME, STORAGE_PREFIX } from '@/lib/config';

// Signing in with a magic link, in two halves that share one piece of state.
//
//  1. requestSignInLink(email) asks the web app to mail a link. It makes a random `state`, remembers
//     it, and puts it in the callbackURL.
//  2. The mail link is opened in the browser and verified there. The web app then redirects to
//     betterauthmulti:///?state=<state>&cookie=<Set-Cookie> (the expo() plugin appends the cookie).
//     acceptSignInLink(url) takes the cookie out of that deep link.
//
// Any app or web page can open betterauthmulti://..., so a link is only accepted when its `state`
// is the one this app just made. Otherwise someone could hand the app their own session cookie
// (login CSRF). The state is used once, and only the newest request counts.
// A custom scheme can still be registered by another app and read the cookie from a real link. That
// needs Universal Links / App Links (or a one-time code exchange) and is a known limit.
const cookieKey = `${STORAGE_PREFIX}_cookie`; // where expoClient keeps the session cookie
const pendingKey = `${STORAGE_PREFIX}_pending_sign_in`;

// The web app's magic link lives for 5 minutes by default; allow a little more.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

type Pending = { state: string; createdAt: number };

function parsePending(raw: string | null): Pending | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { state, createdAt } = value as Record<string, unknown>;
    if (typeof state !== 'string' || state === '' || typeof createdAt !== 'number') return null;
    return { state, createdAt };
  } catch {
    return null;
  }
}

export type RequestResult = { ok: true } | { ok: false; reason: string };

export async function requestSignInLink(email: string): Promise<RequestResult> {
  const state = Crypto.randomUUID();
  try {
    await SecureStore.setItemAsync(pendingKey, JSON.stringify({ state, createdAt: Date.now() }));
    // A path starting with "/" is turned into a link into this app by expoClient.
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: `/?state=${state}`,
    });
    if (!error) return { ok: true };
    await SecureStore.deleteItemAsync(pendingKey);
    return { ok: false, reason: error.message ?? `request failed (${error.status})` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export type AcceptResult =
  | { kind: 'ignored' } // not a sign-in link (no cookie in it)
  | { kind: 'rejected'; reason: string } // looks like one, but is not the link we asked for
  | { kind: 'stored' }
  | { kind: 'failed'; reason: string };

export async function acceptSignInLink(url: string): Promise<AcceptResult> {
  const { scheme, hostname, path, queryParams } = Linking.parse(url);
  const cookie = queryParams?.cookie;
  if (typeof cookie !== 'string' || cookie === '') return { kind: 'ignored' };

  // The redirect is exactly betterauthmulti:///?state=...&cookie=...: no host, no path.
  if (scheme !== APP_SCHEME || hostname || (path && path !== '/')) {
    return { kind: 'rejected', reason: 'unexpected link shape' };
  }

  try {
    const pending = parsePending(await SecureStore.getItemAsync(pendingKey));
    // Used up before anything is stored, so the same link cannot be replayed.
    await SecureStore.deleteItemAsync(pendingKey);
    if (!pending) return { kind: 'rejected', reason: 'no sign-in was requested from this app' };
    if (Date.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      return { kind: 'rejected', reason: 'the request has expired' };
    }
    if (queryParams?.state !== pending.state) {
      return { kind: 'rejected', reason: 'state does not match' };
    }

    const current = await SecureStore.getItemAsync(cookieKey);
    await SecureStore.setItemAsync(cookieKey, getSetCookie(cookie, current ?? undefined));
    // Tell the session hook to fetch the session again with the new cookie.
    authClient.$store.notify('$sessionSignal');
    return { kind: 'stored' };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
