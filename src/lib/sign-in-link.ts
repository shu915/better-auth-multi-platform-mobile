import { getSetCookie } from '@better-auth/expo/client';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { APP_SCHEME, STORAGE_PREFIX } from '@/lib/config';
import { exchangeCode } from '@/lib/exchange-code';
import {
  addPending,
  base64ToBase64Url,
  bytesToBase64Url,
  consumePending,
  judgeLink,
  parsePendingList,
  removePending,
  type Pending,
} from '@/lib/sign-in-rules';

// Signing in with a magic link, in two halves that share the list of open requests.
//
//  1. requestSignInLink(email) asks the web app to mail a link. It makes a random `state` and a
//     random `verifier` (PKCE), remembers both, and puts the state and the challenge
//     (SHA-256 of the verifier) in the callbackURL. The verifier itself never leaves the phone
//     until the exchange.
//  2. The mail link is opened in the browser and verified there. The web app then redirects to
//     betterauthmulti:///?state=<state>&code=<one-time code>. The session is NOT in the link: any app
//     can register the same custom scheme and read what is in it. acceptSignInLink(url) trades the
//     code and the verifier for the session at the web app (exchange-code.ts).
//
// Any app or web page can open betterauthmulti://..., so a link is only accepted when its `state`
// is one this app made and has not used yet. Otherwise someone could hand the app a code of their
// own (login CSRF; their code would also fail the exchange, which needs this request's verifier).
// Each state is used once. A link with a state that is not ours is refused but leaves the open
// requests alone, so it cannot be used to cancel a sign-in. The rules (and their tests) are in
// sign-in-rules.ts.
// What this does not stop: someone who has the mail link itself (it can be opened by whoever has
// it, as before, and its `cc` can be rewritten); and an app that started a sign-in itself (so it knows its own verifier) and
// had the mail opened by the victim could take the code. Only Universal Links / App Links close
// that (see the web repository's docs/design.md).
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

// A new sign-in request (magic link or Google): a random `state` and a PKCE verifier, remembered
// before anything is sent, so a link cannot come back before it is known. Returns the query the web
// app gets in the callbackURL (the state and the challenge, never the verifier).
export async function startRequest(): Promise<{ state: string; query: string }> {
  const state = Crypto.randomUUID();
  // 32 random bytes as base64url: 43 characters, the shape the web app expects.
  const verifier = bytesToBase64Url(Crypto.getRandomBytes(32));
  const challenge = base64ToBase64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  await savePending(addPending(await loadPending(), state, verifier, Date.now()));
  return { state, query: `state=${state}&cc=${challenge}` };
}

// A request that failed or was given up: forget only it.
export async function dropRequest(state: string): Promise<void> {
  await savePending(removePending(await loadPending(), state));
}

export async function requestSignInLink(email: string): Promise<RequestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let state = '';
  try {
    const started = await startRequest();
    state = started.state;
    // A path starting with "/" is turned into a link into this app by expoClient.
    const { error } = await authClient.signIn.magicLink(
      { email, callbackURL: `/?${started.query}` },
      { signal: controller.signal },
    );
    if (!error) return { ok: true };
    // The web app answered with an error, so no mail carries this state: forget it, and only it.
    // (An answer is not the same as no answer: on a timeout or a dropped connection the mail may
    // have been sent anyway, so the state stays.)
    if (typeof error.status === 'number' && error.status >= 400) {
      await dropRequest(state);
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
  | { kind: 'ignored' } // not a sign-in link (no code in it)
  | { kind: 'rejected'; reason: string } // looks like one, but is not the link we asked for
  | { kind: 'stored' }
  | { kind: 'failed'; reason: string };

const REFUSED: Record<'no-request' | 'expired' | 'mismatch', string> = {
  'no-request': 'no sign-in was requested from this app',
  expired: 'the request has expired',
  mismatch: 'state does not match',
};

// The same link can reach the app twice (the in-app browser returns it, and the system may also open
// it), and the two URLs need not be spelled the same, so the one-time code is what is compared. The
// second time is not an error: it is skipped.
const seen: string[] = [];

export async function acceptSignInLink(url: string): Promise<AcceptResult> {
  const parsed = Linking.parse(url);
  const verdict = judgeLink(parsed, APP_SCHEME);
  if (verdict.kind === 'rejected') {
    // A refusal can arrive twice as well (the in-app browser and the listener): say it once, by state.
    const refusedState = parsed.queryParams?.state;
    if (typeof refusedState === 'string') {
      if (seen.includes(`refused:${refusedState}`)) return { kind: 'ignored' };
      seen.push(`refused:${refusedState}`);
      if (seen.length > 5) seen.shift();
    }
  }
  if (verdict.kind !== 'code') return verdict;
  const { code, state } = verdict;
  if (seen.includes(code)) return { kind: 'ignored' };
  seen.push(code);
  if (seen.length > 5) seen.shift();

  try {
    const result = consumePending(await loadPending(), state, Date.now());
    // The open requests are saved before anything else: a state that matched is used up here, so the
    // same link cannot be replayed, and requests that expired are dropped.
    await savePending(result.rest);
    if (!result.ok) return { kind: 'rejected', reason: REFUSED[result.reason] };

    const exchanged = await exchangeCode(code, result.pending.verifier);
    if (!exchanged.ok) return { kind: 'failed', reason: exchanged.reason };

    const current = await SecureStore.getItemAsync(cookieKey);
    await SecureStore.setItemAsync(cookieKey, getSetCookie(exchanged.cookie, current ?? undefined));
    // Tell the session hook to fetch the session again with the new cookie.
    authClient.$store.notify('$sessionSignal');
    return { kind: 'stored' };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
