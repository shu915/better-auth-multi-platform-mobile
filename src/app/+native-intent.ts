// Runs on every URL that opens the app, before Expo Router turns it into a screen.
//
// The sign-in link comes back as betterauthmulti:///?state=...&code=<one-time code>. The root
// layout reads it from Linking.useLinkingURL(), which still sees the original URL. The router must
// not: its route params would keep the code in memory, where an error report or a log of the
// current screen could pick it up. So the router is sent to "/" without the parameters. (A link
// with `cookie` in it is an old or foreign one; it is kept out of the router the same way.)
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return /[?&](code|cookie)=/.test(path) ? '/' : path;
}
