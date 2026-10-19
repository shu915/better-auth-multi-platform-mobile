import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/lib/auth-client';

export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  // Signing out clears the stored session; the root layout then shows the sign-in screen. If it
  // fails (offline, the web app is down) the session is still there, so say so instead of
  // leaving a button that seems to do nothing.
  const signOut = async () => {
    setFailed(false);
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.email}>{session?.user.email}</Text>

        <Pressable
          style={[styles.button, signingOut && styles.buttonDisabled]}
          onPress={signOut}
          disabled={signingOut}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        {failed && (
          <Text style={styles.error}>
            Could not sign out. You are still signed in. Check the connection and try again.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  content: { gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  email: { fontSize: 16 },
  button: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 14, color: '#c0392b' },
});
