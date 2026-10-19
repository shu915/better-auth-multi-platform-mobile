import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestSignInLink } from '@/lib/sign-in-link';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const trimmed = email.trim();
  const canSend = trimmed.includes('@') && status.kind !== 'sending';

  const send = async () => {
    if (!canSend) return;
    setStatus({ kind: 'sending' });
    const result = await requestSignInLink(trimmed);
    // The reason is for developers; the screen says the same thing whatever the cause, so it never
    // tells whether an address is registered.
    setStatus(
      result.ok
        ? { kind: 'sent' }
        : { kind: 'error', message: 'Could not send the link. Check the address and try again.' },
    );
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
          editable={status.kind !== 'sending'}
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  message: { fontSize: 14 },
  error: { fontSize: 14, color: '#c0392b' },
});
