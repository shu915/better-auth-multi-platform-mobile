// Runs on every URL that opens the app, before Expo Router turns it into a screen.
//
// The sign-in link comes back as betterauthmulti:///?state=...&cookie=<session cookie>. The root
// layout reads it from Linking.useLinkingURL(), which still sees the original URL. The router must
// not: its route params would keep the session cookie in memory, where an error report or a log of
// the current screen could pick it up. So the router is sent to "/" without the parameters.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return /[?&]cookie=/.test(path) ? '/' : path;
}
