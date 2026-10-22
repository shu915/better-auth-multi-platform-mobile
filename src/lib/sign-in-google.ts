import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { authClient } from '@/lib/auth-client';
import { STORAGE_PREFIX, WEB_URL } from '@/lib/config';
import { acceptSignInLink, dropRequest, startRequest } from '@/lib/sign-in-link';
import { findOAuthState, linkBelongsTo } from '@/lib/sign-in-rules';

// Signing in with Google, for a user who already linked Google (see google-link.ts). The web app
// never creates a user from Google: a Google account that is not linked is refused, and comes back
// with an error instead of a code.
//
// It follows the magic link: a `state` and a PKCE challenge go in the callbackURL, and the browser
// comes back to betterauthmulti:///?state=…&code=…, which acceptSignInLink trades for the session.
// expoClient would open the browser itself, but it throws the returned link away (it only looks for
// a session in it), so the redirect is turned off and the browser is opened here, with the same
// proxy expoClient uses (it sets the OAuth state cookie in the browser, then goes on to Google).
const cookieKey = `${STORAGE_PREFIX}_cookie`;

export type GoogleSignInResult =
  | { kind: 'signed-in' }
  | { kind: 'cancelled' }
  | { kind: 'refused' } // the web app turned it down (a Google account that is not linked, say)
  | { kind: 'failed' };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  let state = '';
  try {
    const started = await startRequest();
    state = started.state;
    const callbackURL = `/?${started.query}`;
    const { data, error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
      // Where Better Auth sends the browser when Google or the web app refuses; without a `state`
      // the app would ignore the link, so it carries ours. expoClient turns only callbackURL into a
      // link into the app, so this one is written out.
      errorCallbackURL: Linking.createURL(`/?state=${state}`),
      disableRedirect: true,
    });
    if (error || !data?.url) {
      await dropRequest(state);
      return { kind: 'failed' };
    }

    const params = new URLSearchParams({ authorizationURL: data.url });
    const oauthState = findOAuthState(await SecureStore.getItemAsync(cookieKey));
    if (oauthState) params.append('oauthState', oauthState);
    const result = await WebBrowser.openAuthSessionAsync(
      `${WEB_URL}/api/auth/expo-authorization-proxy?${params.toString()}`,
      Linking.createURL('/'),
    );
    if (result.type !== 'success') {
      // On iOS "cancelled" is certain, so the request is given up (else three cancels would push a
      // mail link's request out of the list). On Android the browser can report "cancelled" a
      // moment before the link itself arrives at the app (the layout's listener then handles it),
      // so it is left alone there: it expires by itself (10 minutes).
      if (Platform.OS === 'ios') await dropRequest(state);
      return { kind: 'cancelled' };
    }
    // Any link that opens the app while the browser is up counts as "success" on Android; only the
    // one for this request is ours, and another one must not cancel it.
    if (!linkBelongsTo(Linking.parse(result.url), state)) return { kind: 'cancelled' };

    const accepted = await acceptSignInLink(result.url);
    if (accepted.kind === 'stored') return { kind: 'signed-in' };
    // `ignored` means another path (the layout's listener) already has this link: hands off.
    if (accepted.kind === 'ignored') return { kind: 'cancelled' };
    await dropRequest(state);
    // A link with an error in it is the web app saying no; anything else is a failure.
    return { kind: accepted.kind === 'rejected' ? 'refused' : 'failed' };
  } catch {
    if (state) await dropRequest(state).catch(() => undefined);
    return { kind: 'failed' };
  }
}
