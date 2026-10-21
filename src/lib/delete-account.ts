import { WEB_URL } from '@/lib/config';
import { clearLocalSession } from '@/lib/local-session';
import { getSessionToken } from '@/lib/token';

// Deletes the account through the web app (DELETE /api/mobile/account): the user lives in the web
// app's database and the data in the Go API, and the web app is the one that does both, in order,
// with the same rules as its own "Delete account" form. Authenticated like /token: the session
// token as a Bearer header, no Cookie header, credentials omitted.
//
// The user types their email to confirm. The web app compares it with the session's email; the app
// does not decide.
const TIMEOUT_MS = 20_000; // the web app deletes in several steps, one of them a call to the Go API

export type DeleteResult =
  | { ok: true }
  | {
      ok: false;
      // email-mismatch: the typed email is not the account's. not-fresh: the sign-in is too old
      // (the user signs in again, then retries). signed-out: the session is gone (a 401).
      // failed: anything else; nothing is lost and trying again is safe.
      kind: 'email-mismatch' | 'not-fresh' | 'signed-out' | 'failed';
    };

export async function deleteAccount(confirmEmail: string): Promise<DeleteResult> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) return { ok: false, kind: 'signed-out' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${WEB_URL}/api/mobile/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmEmail }),
      credentials: 'omit',
      signal: controller.signal,
    });
    if (res.ok) {
      // The session is gone with the user. Forget it here too, so the app goes to the sign-in
      // screen. If that fails the account is still deleted: say so, not "failed".
      await clearLocalSession().catch(() => undefined);
      return { ok: true };
    }
    if (res.status === 401) return { ok: false, kind: 'signed-out' };
    if (res.status === 403) return { ok: false, kind: 'not-fresh' };
    if (res.status === 422) return { ok: false, kind: 'email-mismatch' };
    return { ok: false, kind: 'failed' };
  } catch {
    // A timeout or a lost connection: the web app may or may not have finished. Trying again is
    // safe (every step can be repeated), and a user that is already gone answers 401.
    return { ok: false, kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
