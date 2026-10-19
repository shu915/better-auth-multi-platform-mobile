import { expoClient } from '@better-auth/expo/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { APP_SCHEME, STORAGE_PREFIX, WEB_URL } from '@/lib/config';

// The session cookie is kept in SecureStore (Keychain / Keystore) by expoClient. Calls to Better
// Auth send it as a Cookie header (credentials are omitted), so nothing depends on a browser.
export const authClient = createAuthClient({
  baseURL: WEB_URL,
  plugins: [
    expoClient({ scheme: APP_SCHEME, storagePrefix: STORAGE_PREFIX, storage: SecureStore }),
    magicLinkClient(),
  ],
});
