import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeleteAccount } from '@/components/delete-account';
import { ProfileBio } from '@/components/profile-bio';
import { SignInMethods } from '@/components/sign-in-methods';
import { authClient } from '@/lib/auth-client';
import { clearLocalSession } from '@/lib/local-session';

export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  // While the account is being deleted, signing out and saving the profile are off; while the
  // profile is being saved, deleting is off (see DeleteAccount and ProfileBio).
  const [deleting, setDeleting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  // While the profile form is open the delete form is hidden (not unmounted: see DeleteAccount).
  const [editingProfile, setEditingProfile] = useState(false);
  // While Google is being linked or unlinked, the account cannot be deleted (and the other way round).
  const [linking, setLinking] = useState(false);
  // Deleted, but this screen is still up (the phone could not forget the session): the profile
  // stays locked, because a save would create the Go row again; signing out stays possible.
  const [deleted, setDeleted] = useState(false);

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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.title}>Profile</Text>

        <ProfileBio
          name={session?.user.name ?? ''}
          email={session?.user.email ?? ''}
          onUnauthorized={() => void signOut(true)}
          disabled={deleting || deleted}
          onSavingChange={setSavingProfile}
          onEditingChange={setEditingProfile}
        />

        <SignInMethods
          onUnauthorized={() => void signOut(true)}
          onBusyChange={setLinking}
          disabled={deleting || deleted}
        />

        <Pressable
          style={[styles.button, (signingOut || deleting || linking) && styles.buttonDisabled]}
          onPress={() => void signOut()}
          disabled={signingOut || deleting || linking}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        {failed && (
          <Text style={styles.error}>
            {deleted
              ? 'Your account is deleted. Close and reopen the app to finish signing out.'
              : 'Could not sign out. You are still signed in. Check the connection and try again.'}
          </Text>
        )}

        <DeleteAccount
          onUnauthorized={() => void signOut(true)}
          onDeletingChange={setDeleting}
          onDeleted={() => setDeleted(true)}
          disabled={savingProfile || linking || signingOut || deleted}
          hidden={editingProfile}
        />
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
