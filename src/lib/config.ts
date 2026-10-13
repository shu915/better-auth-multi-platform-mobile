import { Platform } from 'react-native';

// Where the web app (Better Auth) and the Go API are reached from the app.
// iOS simulator: localhost is the Mac. Android emulator: the Mac is 10.0.2.2.
// A real phone needs the Mac's LAN address (or a tunnel): set EXPO_PUBLIC_WEB_URL / EXPO_PUBLIC_API_URL.
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? `http://${host}:3000`;
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${host}:8080`;

// Must equal "scheme" in app.json, and the web app's trustedOrigins entry ("betterauthmulti://").
export const APP_SCHEME = 'betterauthmulti';
export const STORAGE_PREFIX = 'betterauthmulti';
