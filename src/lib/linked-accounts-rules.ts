// The decisions the "sign-in methods" section makes, kept free of React Native so they can be
// tested on their own. The wording follows the web app's (src/lib/linked-accounts.ts there).

export type LinkedAccount = { id: string; providerId: string };

// The account row of the user's link to `providerId`, or null when there is none. Unlinking takes
// this id, not the provider name.
export function findLinked(accounts: readonly LinkedAccount[], providerId: string): LinkedAccount | null {
  return accounts.find((account) => account.providerId === providerId) ?? null;
}

// Better Auth answers with an object like this (code and status are set when the server answered).
export type AuthError = { code?: string; status?: number; message?: string };

export type Failure = {
  message: string;
  /** The session is gone (a 401): the parent signs the user out. */
  signOut: boolean;
};

// Linking and unlinking need a recently signed-in session (the web app asks for one within five
// minutes). Say how to fix that instead of showing the raw API message.
const signInAgain = (doing: 'linking' | 'unlinking') =>
  `For security, sign out, sign in again with an email link, then try ${doing} once more, right away.`;

function sessionTooOld(error: AuthError): boolean {
  return error.code === 'SESSION_NOT_FRESH';
}

export function linkFailure(error: AuthError | null | undefined): Failure {
  if (error?.status === 401) return { message: 'Your session has ended.', signOut: true };
  if (error && sessionTooOld(error)) return { message: signInAgain('linking'), signOut: false };
  return { message: 'Could not start linking Google. Check the connection and try again.', signOut: false };
}

export function unlinkFailure(error: AuthError | null | undefined): Failure {
  if (error?.status === 401) return { message: 'Your session has ended.', signOut: true };
  if (error && sessionTooOld(error)) return { message: signInAgain('unlinking'), signOut: false };
  return { message: 'Could not unlink Google. Check the connection and try again.', signOut: false };
}

// The browser comes back the same way whether the user linked Google, cancelled, or Google refused
// (the app is sent back to a link with nothing in it that says which). So the answer is read from
// the accounts, asked for again afterwards.
export type LinkOutcome = 'linked' | 'not-linked';

export function afterLinkAttempt(accountsAfter: readonly LinkedAccount[], providerId: string): LinkOutcome {
  return findLinked(accountsAfter, providerId) ? 'linked' : 'not-linked';
}

// Said when the accounts do not show Google a few seconds after the browser came back. It is
// either a cancel or a refusal, or a link that the web app has not saved yet, and the app cannot
// tell which, so it does not say that nothing happened.
export const NOT_LINKED_MESSAGE =
  'Google was not linked, or is not showing yet. If you finished linking, close and reopen the app to check; otherwise try again.';
export const UNLINK_CONFIRM_TITLE = 'Unlink Google?';
export const UNLINK_CONFIRM_BODY = 'You can still sign in with an email link.';

// Reads the accounts out of what Better Auth answered, which is unknown until checked.
export function toAccounts(data: unknown): LinkedAccount[] | null {
  if (!Array.isArray(data)) return null;
  const accounts: LinkedAccount[] = [];
  for (const item of data as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, providerId } = item as Record<string, unknown>;
    if (typeof id === 'string' && id !== '' && typeof providerId === 'string' && providerId !== '') {
      accounts.push({ id, providerId });
    }
  }
  return accounts;
}
