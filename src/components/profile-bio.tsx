import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getProfile, updateBio } from '@/lib/api';
import { updateName } from '@/lib/profile-name';
import {
  bioFailure,
  hasChanges,
  nameFailure,
  planSave,
  SAVED,
  type Failure,
  type Message,
} from '@/lib/profile-rules';

// The API refuses more than 1000 characters; the input stops there too, but the API decides.
const BIO_MAX = 1000;
// The web app refuses a name over 50 characters; it decides.
const NAME_MAX = 50;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; saved: string };

type Props = {
  // From the web app's session (the user row in Neon). The name is changed through the web app
  // (src/lib/profile-name.ts); the email cannot be changed.
  name: string;
  email: string;
  // The session or the JWT is no longer valid (a 401): the parent signs the user out.
  onUnauthorized: () => void;
  // The account is being deleted: nothing may be saved (a save that lands after the Go data is
  // deleted would create the profile row again).
  disabled?: boolean;
  // Tells the parent while a save is in flight, so the account cannot be deleted meanwhile.
  onSavingChange?: (saving: boolean) => void;
  // Tells the parent while the form is open, so it can hide what must not be pressed meanwhile.
  onEditingChange?: (editing: boolean) => void;
};

// Shows the bio from the Go API and lets the user change it. A failure here stays inside this
// component: the rest of the screen (email, sign out) keeps working.
export function ProfileBio({
  name,
  email,
  onUnauthorized,
  disabled = false,
  onSavingChange,
  onEditingChange,
}: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);
  const locked = saving || disabled;
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const [message, setMessage] = useState<Message | null>(null);

  const [attempt, setAttempt] = useState(0);

  const mounted = useRef(true);
  // A ref, not the `saving` state: two taps in one frame must not both get through.
  const savingRef = useRef(false);
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

  // Loads on mount and on every "Reload". An answer that arrives after the screen is gone, or after
  // a newer load began, is dropped (the cleanup flips `active`).
  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await getProfile();
      if (!active) return;
      if (!result.ok && result.status === 401) {
        // Fall back to the reload state first, so the screen is usable if the sign-out fails.
        setLoad({ kind: 'failed' });
        unauthorized.current();
        return;
      }
      if (result.ok) {
        setDraft(result.data.bio);
        setLoad({ kind: 'ready', saved: result.data.bio });
      } else {
        setLoad({ kind: 'failed' });
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const cancelEdit = () => {
    if (savingRef.current || load.kind !== 'ready') return;
    setDraft(load.saved);
    setNameDraft(name);
    setMessage(null);
    setEditing(false);
  };

  const reload = () => {
    setLoad({ kind: 'loading' });
    setMessage(null);
    setAttempt((n) => n + 1);
  };

  const save = async () => {
    if (disabled || savingRef.current || load.kind !== 'ready') return;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      await saveAll(load.saved);
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  // The name goes to the web app, the bio to the Go API; only what changed is sent, the name first.
  // If the name fails the bio is not sent, so the user fixes one thing at a time.
  const saveAll = async (savedBio: string) => {
    const plan = planSave({ name, nameDraft, savedBio, bioDraft: draft });
    const fail = (failure: Failure) => {
      setMessage(failure.message);
      if (failure.signOut) unauthorized.current();
    };

    if (plan.sendName) {
      const result = await updateName(nameDraft);
      if (!mounted.current) return;
      if (!result.ok) return fail(nameFailure({ status: result.status, refusal: result.message }));
      setNameDraft(result.name);
    }

    if (plan.sendBio) {
      const result = await updateBio(draft);
      if (!mounted.current) return;
      if (!result.ok) return fail(bioFailure({ status: result.status }, plan.sendName));
      setDraft(result.data.bio);
      setLoad({ kind: 'ready', saved: result.data.bio });
    }

    setEditing(false);
    setMessage(SAVED);
  };

  const header = (
    <>
      <Text style={styles.label}>Name</Text>
      <Text style={styles.value}>{name || '—'}</Text>
      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{email}</Text>
    </>
  );

  if (load.kind === 'loading') {
    return (
      <View style={styles.box}>
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  if (load.kind === 'failed') {
    return (
      <View style={styles.box}>
        {header}
        <Text style={styles.error}>Could not load the bio.</Text>
        <Pressable style={styles.button} onPress={reload} accessibilityRole="button">
          <Text style={styles.buttonText}>Reload</Text>
        </Pressable>
      </View>
    );
  }

  if (!editing) {
    return (
      <View style={styles.box}>
        {header}
        <Text style={styles.label}>Bio</Text>
        <Text style={load.saved === '' ? styles.empty : styles.value}>
          {load.saved === '' ? 'No bio yet.' : load.saved}
        </Text>
        <Pressable
          style={[styles.button, disabled && styles.buttonDisabled]}
          disabled={disabled}
          onPress={() => {
            setMessage(null);
            setNameDraft(name);
            setEditing(true);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Edit</Text>
        </Pressable>
        {message !== null && (
          <Text style={message.kind === 'ok' ? styles.ok : styles.error}>{message.text}</Text>
        )}
      </View>
    );
  }

  const unchanged = !hasChanges({ name, nameDraft, savedBio: load.saved, bioDraft: draft });
  return (
    <View style={styles.box}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={[styles.input, styles.nameInput]}
        value={nameDraft}
        onChangeText={(text) => {
          setNameDraft(text);
          setMessage(null);
        }}
        maxLength={NAME_MAX}
        editable={!locked}
        autoCapitalize="words"
        accessibilityLabel="Name"
      />
      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{email}</Text>
      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setMessage(null);
        }}
        maxLength={BIO_MAX}
        multiline
        editable={!locked}
        placeholder="Write something about yourself"
        accessibilityLabel="Bio"
      />
      <Text style={styles.count}>
        {draft.length} / {BIO_MAX}
      </Text>
      <Pressable
        style={[styles.button, (locked || unchanged) && styles.buttonDisabled]}
        onPress={() => void save()}
        disabled={locked || unchanged}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, locked && styles.buttonDisabled]}
        onPress={cancelEdit}
        disabled={locked}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
      {message !== null && (
        <Text style={message.kind === 'ok' ? styles.ok : styles.error}>{message.text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    padding: 12,
    minHeight: 96,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  value: { fontSize: 16 },
  empty: { fontSize: 16, color: '#777' },
  nameInput: { minHeight: 0 },
  count: { fontSize: 12, color: '#777', textAlign: 'right' },
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
  ok: { fontSize: 14, color: '#1e8449' },
});
