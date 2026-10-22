import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { authClient } from '@/lib/auth-client';
import { acceptSignInLink } from '@/lib/sign-in-link';

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();

  // The mail link, verified in the browser, comes back here as a deep link (also when it is what
  // opened the app). Each URL is handled once.
  const url = Linking.useLinkingURL();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!url || handled.current === url) return;
    handled.current = url;
    acceptSignInLink(url).then((result) => {
      // Never show the URL or the reason: the link carries a one-time sign-in code.
      if (result.kind === 'rejected' || result.kind === 'failed') {
        Alert.alert('Sign-in failed', 'This link cannot be used. Request a new one from this app.');
      }
    });
  }, [url]);

  // Until the stored session has been read the first time, show neither screen (no flash of the
  // sign-in form). Only the first time: the session reloads again later (after a sign-out or a
  // deletion, see clearLocalSession), and emptying the screen then would remove the navigator in
  // the middle of Stack.Protected switching screens ("REMOVE_ROUTES ... was not handled").
  const [loaded, setLoaded] = useState(false);
  if (!isPending && !loaded) setLoaded(true);
  if (!loaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}
