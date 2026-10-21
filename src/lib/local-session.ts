import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { STORAGE_PREFIX } from '@/lib/config';

// Forgets the session on this phone only, without asking the web app. Used when the web app has
// already said the session is invalid (a 401) but a normal sign-out cannot finish (offline, or the
// web app errors): the user must not be stuck on a screen whose every call fails. The server
// session, if any is left, simply expires. The keys are the ones expoClient keeps (see
// auth-client.ts).
//
// Two things are needed. The stored values go, so a restart does not bring the session back. And
// the in-memory session is set to "no user" directly, like expoClient's own clearSessionCache:
// asking the session to reload is not enough, because when that reload fails (the web app is
// down, which is when this runs) Better Auth keeps the old user and the screen would not change.
//
// A large session_data is stored by expoClient in pieces ("<key>.N", with a marker in the base
// key). Only the base keys are deleted here; the pieces are unreachable without the marker and are
// replaced the next time a session is stored.
export async function clearLocalSession(): Promise<void> {
  await Promise.all(
    ['cookie', 'session_data'].map((name) =>
      SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_${name}`),
    ),
  );
  const session = authClient.$store.atoms.session;
  session.set({ ...session.get(), data: null, error: null, isPending: false });
  authClient.$store.notify('$sessionSignal');
}
