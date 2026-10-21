import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileBio } from '@/components/profile-bio';
import { authClient } from '@/lib/auth-client';
import { clearLocalSession } from '@/lib/local-session';

export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  // Signing out clears the stored session; the root layout then shows the sign-in screen. If it
  // fails (offline, the web app is down) the session is still there, so say so instead of
  // leaving a button that seems to do nothing.
  // `sessionEnded` is for a 401 from the server: the session is already invalid, so if the
  // sign-out cannot finish either, the phone's copy is cleared anyway (see clearLocalSession).
  const signOut = async (sessionEnded = false) => {
    if (signingOut) return;
    setFailed(false);
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) throw error;
    } catch {
      if (sessionEnded) {
        try {
          await clearLocalSession();
          return;
        } catch {
          // fall through to the message
        }
      }
      setFailed(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Profile</Text>

        <ProfileBio
          name={session?.user.name ?? ''}
          email={session?.user.email ?? ''}
          onUnauthorized={() => void signOut(true)}
        />

        <Pressable
          style={[styles.button, signingOut && styles.buttonDisabled]}
          onPress={() => void signOut()}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  content: { gap: 12, paddingVertical: 24 },
  title: { fontSize: 24, fontWeight: '600' },
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
