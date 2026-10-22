import { authClient } from '@/lib/auth-client';
import {
  afterLinkAttempt,
  linkFailure,
  toAccounts,
  unlinkFailure,
  type AuthError,
  type Failure,
  type LinkedAccount,
} from '@/lib/linked-accounts-rules';

// Google as an extra way to sign in, added by a user who is already signed in with an email link
// (the web app never lets Google create a user). The calls go through Better Auth's client, which
// sends the stored session cookie as a Cookie header; the web app asks for a sign-in within the
// last five minutes for both linking and unlinking, and sends the user an email about a link.
const TIMEOUT_MS = 15_000;

// The browser can come back to the app a moment before the web app has saved the link, so the
// accounts are read again for a few seconds before it is called "not linked".
const LINK_CHECKS = 4;
const LINK_CHECK_INTERVAL_MS = 1_500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Result<T> = ({ ok: true } & T) | { ok: false; failure: Failure };

const unreachable = (to: 'link' | 'unlink'): Failure =>
  (to === 'link' ? linkFailure : unlinkFailure)(undefined);

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function loadAccounts(): Promise<Result<{ accounts: LinkedAccount[] }>> {
  try {
    const { data, error } = await withTimeout(authClient.listAccounts());
    const accounts = error ? null : toAccounts(data);
    if (accounts) return { ok: true, accounts };
    const unauthorized = (error as AuthError | null)?.status === 401;
    return {
      ok: false,
      failure: unauthorized
        ? { message: 'Your session has ended.', signOut: true }
        : { message: 'Could not load your sign-in methods.', signOut: false },
    };
  } catch {
    return { ok: false, failure: { message: 'Could not load your sign-in methods.', signOut: false } };
  }
}

// Opens Google in the in-app browser. The call returns when the browser is closed or comes back to
// the app, and does not say whether Google was linked, so the accounts are read again.
// It returns the accounts it read afterwards, so what the screen shows and what was decided come
// from the same answer.
export async function linkGoogle(): Promise<Result<{ linked: boolean; accounts: LinkedAccount[] }>> {
  try {
    const { error } = await authClient.linkSocial({
      provider: 'google',
      // A path starting with "/" is turned into a link into this app by expoClient.
      callbackURL: '/',
      errorCallbackURL: '/',
    });
    if (error) return { ok: false, failure: linkFailure(error) };
    let after = await loadAccounts();
    for (let check = 1; after.ok && check < LINK_CHECKS; check++) {
      if (afterLinkAttempt(after.accounts, 'google') === 'linked') break;
      await sleep(LINK_CHECK_INTERVAL_MS);
      after = await loadAccounts();
    }
    if (!after.ok) return { ok: false, failure: after.failure };
    return {
      ok: true,
      accounts: after.accounts,
      linked: afterLinkAttempt(after.accounts, 'google') === 'linked',
    };
  } catch {
    return { ok: false, failure: unreachable('link') };
  }
}

export async function unlinkGoogle(accountId: string): Promise<Result<object>> {
  try {
    const { error } = await withTimeout(authClient.unlinkAccount({ accountId }));
    if (error) return { ok: false, failure: unlinkFailure(error) };
    return { ok: true };
  } catch {
    return { ok: false, failure: unreachable('unlink') };
  }
}
