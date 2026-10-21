import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { STORAGE_PREFIX } from '@/lib/config';

// Forgets the session on this phone only, without asking the web app. Used when the web app has
// already said the session is invalid (a 401) but a normal sign-out cannot finish (offline, or the
// web app errors): the user must not be stuck on a screen whose every call fails. The server
// session, if any is left, simply expires. The keys are the ones expoClient keeps (see
// auth-client.ts), and the root layout shows the sign-in screen once the session is empty.
export async function clearLocalSession(): Promise<void> {
  await Promise.all(
    ['cookie', 'session_data'].map((name) =>
      SecureStore.deleteItemAsync(`${STORAGE_PREFIX}_${name}`),
    ),
  );
  authClient.$store.notify('$sessionSignal');
}
