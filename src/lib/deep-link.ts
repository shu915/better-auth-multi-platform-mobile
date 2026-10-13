import { getSetCookie } from '@better-auth/expo/client';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { authClient } from '@/lib/auth-client';
import { STORAGE_PREFIX } from '@/lib/config';

// SPIKE. After a magic link is verified in the browser, the web app redirects to
// betterauthmulti://...?cookie=<Set-Cookie> (the expo() plugin appends it). expoClient only reads
// that parameter itself for social sign-in (openAuthSessionAsync). A magic link is opened from the
// mail app, so nothing is waiting for the result: the app has to take the cookie out of the deep
// link and store it where expoClient keeps its cookie.
const cookieKey = `${STORAGE_PREFIX}_cookie`;

export type LinkResult =
  | { kind: 'ignored' } // not a sign-in link
  | { kind: 'stored' }
  | { kind: 'failed'; reason: string };

export async function acceptSessionFromLink(url: string): Promise<LinkResult> {
  const { queryParams } = Linking.parse(url);
  const cookie = queryParams?.cookie;
  if (typeof cookie !== 'string' || cookie === '') return { kind: 'ignored' };
  try {
    const current = await SecureStore.getItemAsync(cookieKey);
    await SecureStore.setItemAsync(cookieKey, getSetCookie(cookie, current ?? undefined));
    // Tell the session hook to fetch the session again with the new cookie.
    authClient.$store.notify('$sessionSignal');
    return { kind: 'stored' };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
