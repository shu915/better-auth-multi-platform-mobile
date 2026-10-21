import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteAccount, type DeleteResult } from '@/lib/delete-account';

type Props = {
  // The session is gone (a 401): the parent signs the user out.
  onUnauthorized: () => void;
  // Tells the parent while the deletion is in flight, so it can switch off what must not run
  // meanwhile (sign out would end the session before the web app is done; a bio save would land
  // after the Go data is gone and create the row again).
  onDeletingChange?: (deleting: boolean) => void;
  // The account is deleted but this screen is still up (the phone could not forget the session):
  // the parent keeps the profile locked, and still allows signing out.
  onDeleted?: () => void;
  // Something else is in flight (a bio save, a sign-out): do not start deleting.
  disabled?: boolean;
};

const MESSAGES = {
  'email-mismatch': 'That is not the email address of this account.',
  'not-fresh':
    'For security, sign out, sign in again with an email link, then delete your account right away (within a few minutes).',
  'signed-out': 'Your session has ended.',
  failed: 'Could not delete your account. Check the connection and try again; repeating it is safe.',
} satisfies Record<Extract<DeleteResult, { ok: false }>['kind'], string>;

// Deleting the account is final: the user types their email to confirm, and the web app checks it
// against the session's email (this component does not decide). A successful deletion forgets the
// session on the phone, which sends the app to the sign-in screen and removes this component.
export function DeleteAccount({
  onUnauthorized,
  onDeletingChange,
  onDeleted,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    onDeletingChange?.(deleting);
  }, [deleting, onDeletingChange]);
  const [message, setMessage] = useState<string | null>(null);

  const mounted = useRef(true);
  // A ref, not the `deleting` state: two taps in one frame must not both get through.
  const deletingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const close = () => {
    if (deletingRef.current) return;
    setOpen(false);
    setEmail('');
    setMessage(null);
  };

  const submit = async () => {
    if (disabled || deletingRef.current || email.trim() === '') return;
    deletingRef.current = true;
    setDeleting(true);
    setMessage(null);
    let result: DeleteResult;
    try {
      result = await deleteAccount(email);
    } finally {
      deletingRef.current = false;
      if (mounted.current) setDeleting(false);
    }
    if (!mounted.current) return;
    if (result.ok) {
      // Normally the app has already gone to the sign-in screen and this component is gone. Still
      // here means the account is deleted but the phone could not forget the session: say so (the
      // user must not think it failed and press again) and finish through the sign-out path.
      onDeleted?.();
      setMessage('Your account was deleted. If this screen stays, close and reopen the app to finish signing out.');
      onUnauthorized();
      return;
    }
    setMessage(MESSAGES[result.kind]);
    if (result.kind === 'signed-out') onUnauthorized();
  };

  if (!open) {
    return (
      <Pressable
        style={[styles.dangerButton, disabled && styles.disabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.dangerText}>Delete account</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Delete account</Text>
      <Text style={styles.warning}>
        This deletes your account and your data. It cannot be undone. To confirm, type the email
        address of this account.
      </Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setMessage(null);
        }}
        editable={!deleting}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="Email address"
        accessibilityLabel="Confirm your email address"
      />
      <Pressable
        style={[styles.dangerButton, (deleting || disabled || email.trim() === '') && styles.disabled]}
        onPress={() => void submit()}
        disabled={deleting || disabled || email.trim() === ''}
        accessibilityRole="button"
      >
        <Text style={styles.dangerText}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, deleting && styles.disabled]}
        onPress={close}
        disabled={deleting}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
      {message !== null && <Text style={styles.error}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 16 },
  heading: { fontSize: 18, fontWeight: '600', color: '#c0392b' },
  warning: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerText: { fontSize: 16, fontWeight: '600', color: '#c0392b' },
  disabled: { opacity: 0.4 },
  error: { fontSize: 14, color: '#c0392b' },
});
