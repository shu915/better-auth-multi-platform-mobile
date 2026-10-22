import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { linkGoogle, loadAccounts, unlinkGoogle } from '@/lib/google-link';
import {
  findLinked,
  NOT_LINKED_MESSAGE,
  UNLINK_CONFIRM_BODY,
  UNLINK_CONFIRM_TITLE,
  type LinkedAccount,
} from '@/lib/linked-accounts-rules';

type Props = {
  // The session is gone (a 401): the parent signs the user out.
  onUnauthorized: () => void;
  // Tells the parent while a link or unlink is in flight, so it can switch off what must not run
  // meanwhile (deleting the account).
  onBusyChange?: (busy: boolean) => void;
  // Something else is in flight (a deletion): change nothing.
  disabled?: boolean;
};

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; accounts: LinkedAccount[] };
type Message = { kind: 'ok' | 'error'; text: string };

// How the user signs in. The email link is the root and is always there; Google is an extra that
// a signed-in user links or unlinks. The web app asks for a sign-in within the last five minutes
// for both, and emails the user when a method is linked.
export function SignInMethods({ onUnauthorized, onBusyChange, disabled = false }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [attempt, setAttempt] = useState(0);

  const mounted = useRef(true);
  const busyRef = useRef(false); // not the state: two taps in one frame must not both get through
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Loads on mount and on every "Reload".
  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await loadAccounts();
      if (!active) return;
      if (result.ok) {
        setLoad({ kind: 'ready', accounts: result.accounts });
        return;
      }
      setLoad({ kind: 'failed' });
      if (result.failure.signOut) unauthorized.current();
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const reload = () => {
    setLoad({ kind: 'loading' });
    setMessage(null);
    setAttempt((n) => n + 1);
  };

  const run = async (work: () => Promise<void>) => {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  // Reads the accounts again. If that fails the list on screen can no longer be trusted, so the
  // section falls back to "could not load" with a Reload button, instead of showing a state that
  // may be wrong with no way to fix it.
  const refresh = async () => {
    const result = await loadAccounts();
    if (!mounted.current) return;
    if (result.ok) {
      setLoad({ kind: 'ready', accounts: result.accounts });
      return;
    }
    setLoad({ kind: 'failed' });
    if (result.failure.signOut) unauthorized.current();
  };

  const link = () =>
    run(async () => {
      const result = await linkGoogle();
      if (!mounted.current) return;
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.failure.message });
        if (result.failure.signOut) unauthorized.current();
        // The link may have gone through even though the answer did not come back: look again.
        else await refresh();
        return;
      }
      // The accounts read for the decision are the ones shown: one answer, not two.
      setLoad({ kind: 'ready', accounts: result.accounts });
      setMessage(
        result.linked ? { kind: 'ok', text: 'Google is linked.' } : { kind: 'error', text: NOT_LINKED_MESSAGE },
      );
    });

  const unlink = (accountId: string) =>
    run(async () => {
      const result = await unlinkGoogle(accountId);
      if (!mounted.current) return;
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.failure.message });
        if (result.failure.signOut) unauthorized.current();
        // A request that timed out may have been done on the server: look again, so the list does
        // not offer to unlink an account that is already gone.
        else await refresh();
        return;
      }
      await refresh();
      if (mounted.current) setMessage({ kind: 'ok', text: 'Google is unlinked.' });
    });

  const confirmUnlink = (accountId: string) =>
    Alert.alert(UNLINK_CONFIRM_TITLE, UNLINK_CONFIRM_BODY, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => void unlink(accountId) },
    ]);

  const locked = busy || disabled;
  const google = load.kind === 'ready' ? findLinked(load.accounts, 'google') : null;

  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Sign-in methods</Text>
      <Text style={styles.row}>Email link: always on</Text>

      {load.kind === 'loading' && <ActivityIndicator />}

      {load.kind === 'failed' && (
        <>
          <Text style={styles.error}>Could not load your sign-in methods.</Text>
          <Pressable style={styles.button} onPress={reload} accessibilityRole="button">
            <Text style={styles.buttonText}>Reload</Text>
          </Pressable>
        </>
      )}

      {load.kind === 'ready' && (
        <>
          <Text style={styles.row}>Google: {google ? 'linked' : 'not linked'}</Text>
          {google ? (
            <Pressable
              style={[styles.button, locked && styles.disabled]}
              onPress={() => confirmUnlink(google.id)}
              disabled={locked}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{busy ? 'Working…' : 'Unlink Google'}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.button, locked && styles.disabled]}
              onPress={() => void link()}
              disabled={locked}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{busy ? 'Working…' : 'Link Google'}</Text>
            </Pressable>
          )}
        </>
      )}

      {message !== null && (
        <Text style={message.kind === 'ok' ? styles.ok : styles.error}>{message.text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 16 },
  heading: { fontSize: 18, fontWeight: '600' },
  row: { fontSize: 16 },
  button: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  error: { fontSize: 14, color: '#c0392b' },
  ok: { fontSize: 14, color: '#1e8449' },
});
