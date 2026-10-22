import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithGoogle } from '@/lib/sign-in-google';
import { requestSignInLink } from '@/lib/sign-in-link';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'google' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const trimmed = email.trim();
  const busy = status.kind === 'sending' || status.kind === 'google';
  const canSend = trimmed.includes('@') && !busy;

  const send = async () => {
    if (!canSend) return;
    setStatus({ kind: 'sending' });
    const result = await requestSignInLink(trimmed);
    if (result.ok) {
      setStatus({ kind: 'sent' });
      return;
    }
    // The reason is for developers. The screen does not tell whether an address is registered: the
    // message is the same whatever the cause, except when the web app says "too many requests",
    // which says nothing about the address.
    setStatus({
      kind: 'error',
      message:
        result.status === 429
          ? 'Too many requests. Wait a little and try again.'
          : 'Could not send the link. Check the address and try again.',
    });
  };

  // Only for an account that already linked Google (profile screen). The message does not say
  // which of the reasons it was.
  // The ref blocks a second tap before the state has been re-rendered.
  const googleRunning = useRef(false);
  const google = async () => {
    if (busy || googleRunning.current) return;
    googleRunning.current = true;
    setStatus({ kind: 'google' });
    const result = await signInWithGoogle().finally(() => {
      googleRunning.current = false;
    });
    if (result.kind === 'signed-in' || result.kind === 'cancelled') {
      setStatus({ kind: 'idle' }); // signed in: the screen is replaced
      return;
    }
    setStatus({
      kind: 'error',
      message:
        result.kind === 'refused'
          ? 'Google sign-in is only for accounts that linked Google. Sign in with an email link first.'
          : 'Could not sign in with Google. Try again.',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.hint}>We email you a link. Open it on this device.</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          textContentType="emailAddress"
          editable={!busy}
          onSubmitEditing={send}
        />

        <Pressable
          style={[styles.button, !canSend && styles.buttonDisabled]}
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {status.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.googleButton, busy && styles.buttonDisabled]}
          onPress={() => void google()}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.googleText}>
            {status.kind === 'google' ? 'Opening Google…' : 'Sign in with Google'}
          </Text>
        </Pressable>
        <Text style={styles.hint}>Google works only if you linked it after signing in by email.</Text>

        {status.kind === 'sent' && (
          <Text style={styles.message}>
            If the address can sign in, a link is on its way. Open it on this device.
          </Text>
        )}
        {status.kind === 'error' && <Text style={styles.error}>{status.message}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  form: { gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  hint: { fontSize: 14, color: '#555' },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  googleButton: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  googleText: { fontSize: 16, fontWeight: '600' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  message: { fontSize: 14 },
  error: { fontSize: 14, color: '#c0392b' },
});
