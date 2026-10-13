import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/lib/auth-client';
import { API_URL, WEB_URL } from '@/lib/config';
import { acceptSessionFromLink } from '@/lib/deep-link';
import { fetchJwt } from '@/lib/token';

// SPIKE screen: it only answers three questions, in this order.
//   1. Does the magic link bring the session back into the app (deep link)?
//   2. Can the app get a JWT with that session (a bearer-only GET /api/auth/token, see lib/token.ts)?
//   3. Does the Go API accept that JWT (GET /me)?
// Everything is logged on screen. Throw this away once the answers are known.

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export default function Spike() {
  const [email, setEmail] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [jwt, setJwt] = useState<string | null>(null);
  const { data: session, isPending } = authClient.useSession();
  const handled = useRef<string | null>(null);

  const say = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString()}  ${line}`, ...lines]);

  // 1. A deep link arrives (also when the app is opened by it).
  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (!url || handled.current === url) return;
    handled.current = url;
    say(`deep link: ${url.replace(/cookie=[^&]*/, 'cookie=…')}`);
    acceptSessionFromLink(url).then((result) => say(`cookie from link: ${describe(result)}`));
  }, [url]);

  const sendLink = async () => {
    say(`sending a magic link to ${email} (web: ${WEB_URL})`);
    const { data, error } = await authClient.signIn.magicLink({ email, callbackURL: '/' });
    say(error ? `send failed: ${describe(error)}` : `sent: ${describe(data)}. Open the link on this device.`);
  };

  // 2. JWT for the Go API.
  const getJwt = async () => {
    const result = await fetchJwt();
    if (!result.ok) {
      say(`token failed: ${result.reason}`);
      return;
    }
    setJwt(result.token);
    say(`token ok (${result.token.length} chars)`);
  };

  // 3. The Go API, called directly with the JWT.
  const callGo = async () => {
    if (!jwt) return say('no JWT yet: press "Get JWT" first');
    try {
      const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${jwt}` } });
      say(`GET ${API_URL}/me → ${res.status} ${await res.text()}`);
    } catch (error) {
      say(`Go request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Auth spike</Text>
        <Text style={styles.small}>web {WEB_URL} · go {API_URL}</Text>

        <Text style={styles.label}>Session</Text>
        <Text style={styles.mono}>
          {isPending ? 'loading…' : session ? `signed in as ${session.user.email}` : 'not signed in'}
        </Text>

        <Text style={styles.label}>1. Magic link</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <Button title="Send magic link" onPress={sendLink} disabled={!email} />

        <Text style={styles.label}>2. JWT</Text>
        <Button title="Get JWT" onPress={getJwt} disabled={!session} />

        <Text style={styles.label}>3. Go API</Text>
        <Button title="GET /me" onPress={callGo} disabled={!jwt} />

        <View style={styles.gap} />
        <Button title="Sign out" onPress={() => authClient.signOut().then(() => setJwt(null))} disabled={!session} />

        <Text style={styles.label}>Log</Text>
        {log.map((line, i) => (
          <Text key={i} style={styles.mono}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  small: { fontSize: 12, color: '#666' },
  label: { marginTop: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10 },
  mono: { fontFamily: 'Courier', fontSize: 12 },
  gap: { height: 12 },
});
