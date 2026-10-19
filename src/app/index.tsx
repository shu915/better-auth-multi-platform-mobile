import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/lib/auth-client';

export default function HomeScreen() {
  const { data: session } = authClient.useSession();

  // Signing out clears the stored session; the root layout then shows the sign-in screen.
  const signOut = () => {
    void authClient.signOut();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.email}>{session?.user.email}</Text>

        <Pressable style={styles.button} onPress={signOut} accessibilityRole="button">
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
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
  buttonText: { fontSize: 16, fontWeight: '600' },
});
