import { Platform } from 'react-native';

// Where the web app (Better Auth) and the Go API are reached from the app.
// Development: iOS simulator's localhost is the Mac; Android emulator reaches the Mac at 10.0.2.2.
// A real phone needs the Mac's LAN address (or a tunnel): set EXPO_PUBLIC_WEB_URL / EXPO_PUBLIC_API_URL.
// Release builds must set both, and they must be https.
const devHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

function resolveUrl(name: string, value: string | undefined, devDefault: string): string {
  if (!value) {
    if (__DEV__) return devDefault;
    throw new Error(`${name} must be set in a release build`);
  }
  if (!__DEV__ && !value.startsWith('https://')) {
    throw new Error(`${name} must be an https URL in a release build`);
  }
  return value.replace(/\/+$/, '');
}

// process.env.EXPO_PUBLIC_* is replaced at bundle time only when written out like this.
export const WEB_URL = resolveUrl(
  'EXPO_PUBLIC_WEB_URL',
  process.env.EXPO_PUBLIC_WEB_URL,
  `http://${devHost}:3000`,
);
export const API_URL = resolveUrl(
  'EXPO_PUBLIC_API_URL',
  process.env.EXPO_PUBLIC_API_URL,
  `http://${devHost}:8080`,
);

// Must equal "scheme" in app.json, and the web app's trustedOrigins entry ("betterauthmulti://").
export const APP_SCHEME = 'betterauthmulti';
export const STORAGE_PREFIX = 'betterauthmulti';
