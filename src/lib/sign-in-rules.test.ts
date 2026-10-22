import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  addPending,
  base64ToBase64Url,
  bytesToBase64Url,
  isVerifier,
  judgeLink,
  consumePending,
  hasSignInLinkShape,
  MAX_PENDING,
  parsePendingList,
  PENDING_MAX_AGE_MS,
  removePending,
  type Pending,
} from '@/lib/sign-in-rules';

// These rules are what stands between the app and a login CSRF (someone handing the app their own
// session cookie through a betterauthmulti:// link), so they are pinned here.

const NOW = 1_800_000_000_000;
const VERIFIER = 'v'.repeat(43);
const open = (state: string, ageMs = 0): Pending => ({
  state,
  verifier: VERIFIER,
  createdAt: NOW - ageMs,
});

describe('consumePending', () => {
  it('accepts the state of an open request, and uses it up', () => {
    const result = consumePending([open('a')], 'a', NOW);
    expect(result).toEqual({ ok: true, rest: [], pending: open('a') });
  });

  it('gives back the verifier of the request that matched, to trade the code with', () => {
    const list = [
      { state: 'a', verifier: 'A'.repeat(43), createdAt: NOW },
      { state: 'b', verifier: 'B'.repeat(43), createdAt: NOW },
    ];
    const result = consumePending(list, 'b', NOW);
    expect(result.ok && result.pending.verifier).toBe('B'.repeat(43));
  });

  it('does not accept the same link twice', () => {
    const first = consumePending([open('a')], 'a', NOW);
    if (!first.ok) throw new Error('the first use should be accepted');
    const second = consumePending(first.rest, 'a', NOW);
    expect(second.ok).toBe(false);
  });

  it('refuses a state that is not ours, and keeps the open requests', () => {
    const list = [open('a'), open('b')];
    const result = consumePending(list, 'someone-elses', NOW);
    expect(result).toEqual({ ok: false, reason: 'mismatch', rest: list });
  });

  it('keeps a sign-in in progress when a wrong link arrives, so the real mail still works', () => {
    const wrong = consumePending([open('real')], 'forged', NOW);
    expect(wrong.ok).toBe(false);
    const real = consumePending(wrong.rest, 'real', NOW);
    expect(real.ok).toBe(true);
  });

  it('refuses everything when no sign-in was requested', () => {
    expect(consumePending([], 'a', NOW)).toEqual({ ok: false, reason: 'no-request', rest: [] });
  });

  it('refuses an empty state', () => {
    expect(consumePending([open('a')], '', NOW).ok).toBe(false);
  });

  it('accepts a request until it is PENDING_MAX_AGE_MS old, and not after', () => {
    expect(consumePending([open('a', PENDING_MAX_AGE_MS)], 'a', NOW).ok).toBe(true);
    const late = consumePending([open('a', PENDING_MAX_AGE_MS + 1)], 'a', NOW);
    expect(late).toEqual({ ok: false, reason: 'expired', rest: [] });
  });

  it('drops expired requests but leaves the live ones', () => {
    const result = consumePending([open('old', PENDING_MAX_AGE_MS + 1), open('live')], 'live', NOW);
    expect(result).toEqual({ ok: true, rest: [], pending: open('live') });
    const other = consumePending([open('old', PENDING_MAX_AGE_MS + 1), open('live')], 'x', NOW);
    expect(other).toEqual({ ok: false, reason: 'mismatch', rest: [open('live')] });
  });

  it('uses up only the request that matched', () => {
    const result = consumePending([open('a'), open('b'), open('c')], 'b', NOW);
    expect(result).toEqual({ ok: true, rest: [open('a'), open('c')], pending: open('b') });
  });
});

describe('addPending and removePending', () => {
  it('keeps a mail that is already in the inbox usable when the user asks for another', () => {
    // The first mail (state A) is out. The second request may get no mail at all (the web app
    // answers the same whether or not it sent one), so A must still be accepted.
    const list = addPending(addPending([], 'A', VERIFIER, NOW), 'B', VERIFIER, NOW + 1000);
    expect(consumePending(list, 'A', NOW + 2000).ok).toBe(true);
  });

  it('keeps only the newest MAX_PENDING requests', () => {
    let list: Pending[] = [];
    for (let i = 0; i < MAX_PENDING + 2; i++) list = addPending(list, `s${i}`, VERIFIER, NOW + i);
    expect(list.map((p) => p.state)).toEqual(['s2', 's3', 's4']);
  });

  it('drops expired requests when a new one is added', () => {
    const list = addPending([open('old', PENDING_MAX_AGE_MS + 1)], 'new', VERIFIER, NOW);
    expect(list).toEqual([open('new')]);
  });

  it('removes only the refused request', () => {
    expect(removePending([open('a'), open('b')], 'b')).toEqual([open('a')]);
    expect(removePending([open('a')], 'nope')).toEqual([open('a')]);
  });
});

describe('parsePendingList', () => {
  it('reads what was stored', () => {
    const list = [open('a'), open('b', 5)];
    expect(parsePendingList(JSON.stringify(list))).toEqual(list);
  });

  it('gives an empty list for nothing, junk, or the wrong shape', () => {
    for (const raw of [null, '', 'not json', '{}', '"a"', '42', 'null']) {
      expect(parsePendingList(raw)).toEqual([]);
    }
  });

  it('skips entries that are not a state with a time', () => {
    const raw = JSON.stringify([
      open('ok'),
      { state: '', verifier: VERIFIER, createdAt: NOW },
      { state: 'no-time', verifier: VERIFIER },
      { state: 'no-verifier', createdAt: NOW },
      { state: 'short-verifier', verifier: 'short', createdAt: NOW },
      { state: 5, verifier: VERIFIER, createdAt: NOW },
      'text',
      null,
    ]);
    expect(parsePendingList(raw)).toEqual([open('ok')]);
  });
});

describe('hasSignInLinkShape', () => {
  const scheme = 'betterauthmulti';

  it('accepts the redirect the web app sends: the scheme with no host and no path', () => {
    expect(hasSignInLinkShape({ scheme, hostname: '', path: '' }, scheme)).toBe(true);
    expect(hasSignInLinkShape({ scheme, hostname: null, path: null }, scheme)).toBe(true);
    expect(hasSignInLinkShape({ scheme, hostname: undefined, path: '/' }, scheme)).toBe(true);
  });

  it('refuses another scheme', () => {
    expect(hasSignInLinkShape({ scheme: 'https', hostname: '', path: '' }, scheme)).toBe(false);
    expect(hasSignInLinkShape({ scheme: null, hostname: '', path: '' }, scheme)).toBe(false);
  });

  it('refuses a link with a host or a path', () => {
    expect(hasSignInLinkShape({ scheme, hostname: 'evil.test', path: '' }, scheme)).toBe(false);
    expect(hasSignInLinkShape({ scheme, hostname: '', path: 'admin' }, scheme)).toBe(false);
    expect(hasSignInLinkShape({ scheme, hostname: '', path: '/a/b' }, scheme)).toBe(false);
  });
});

describe('the verifier', () => {
  it('encodes bytes as base64url without padding (RFC 4648 §5 test vectors)', () => {
    const enc = (text: string) => bytesToBase64Url(new TextEncoder().encode(text));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg');
    expect(enc('fo')).toBe('Zm8');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foob')).toBe('Zm9vYg');
    expect(enc('fooba')).toBe('Zm9vYmE');
    expect(enc('foobar')).toBe('Zm9vYmFy');
  });

  it('uses - and _ where base64 uses + and /', () => {
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(base64ToBase64Url('+/+/AA==')).toBe('-_-_AA');
  });

  it('makes the challenge the web app expects (RFC 7636 appendix B: S256 of the example verifier)', () => {
    // expo-crypto gives the digest as standard base64; the challenge is that, as base64url.
    const digest = createHash('sha256').update('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk').digest('base64');
    expect(base64ToBase64Url(digest)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('turns 32 random bytes into a verifier of the shape the web app accepts', () => {
    const verifier = bytesToBase64Url(new Uint8Array(32).fill(255));
    expect(verifier).toHaveLength(43);
    expect(isVerifier(verifier)).toBe(true);
  });

  it('accepts 43 to 128 unreserved characters, and nothing else', () => {
    expect(isVerifier('a'.repeat(43))).toBe(true);
    expect(isVerifier('a'.repeat(128))).toBe(true);
    expect(isVerifier('a'.repeat(42))).toBe(false);
    expect(isVerifier('a'.repeat(129))).toBe(false);
    expect(isVerifier('a'.repeat(42) + '=')).toBe(false);
    expect(isVerifier('a'.repeat(42) + ' ')).toBe(false);
  });
});

describe('judgeLink', () => {
  const scheme = 'betterauthmulti';
  const link = (queryParams: Record<string, unknown> | null, rest: object = {}) =>
    judgeLink({ scheme, hostname: '', path: '', queryParams, ...rest }, scheme);

  it('wants the code and the state of a link the web app sends', () => {
    expect(link({ state: 's1', code: 'c1' })).toEqual({ kind: 'code', code: 'c1', state: 's1' });
  });

  it('refuses a link of ours (it has a state) that carries a session cookie, and never reads a code from it', () => {
    expect(link({ state: 's1', code: 'c1', cookie: 'better-auth.session_token=x' })).toEqual({
      kind: 'rejected',
      reason: 'a link with a session in it is not accepted',
    });
    expect(link({ state: 's1', cookie: 'x' }).kind).toBe('rejected');
  });

  it('refuses a link of ours that the web app turned down (an error)', () => {
    expect(link({ state: 's1', error: 'missing_challenge' }).kind).toBe('rejected');
    // An error wins even when a code is there too.
    expect(link({ state: 's1', code: 'c1', error: 'x' }).kind).toBe('rejected');
  });

  it('ignores a link with no state: it is not for a sign-in, whatever it carries', () => {
    // The browser coming back from linking Google, or a foreign link: no "sign-in failed" message.
    for (const params of [
      null,
      {},
      { error: 'account_already_linked_to_different_user' },
      { error: 'x', error_description: 'y' },
      { cookie: 'x' },
      { code: 'c1' },
      { state: '', error: 'x' },
      { state: ['a', 'b'], error: 'x' },
    ]) {
      expect(link(params)).toEqual({ kind: 'ignored' });
    }
  });

  it('ignores a link of ours with no code and no error', () => {
    for (const params of [{ state: 's1' }, { state: 's1', code: '' }, { state: 's1', code: 5 }, { state: 's1', code: ['a', 'b'] }]) {
      expect(link(params)).toEqual({ kind: 'ignored' });
    }
  });

  it('refuses a link of ours of the wrong shape, even with a code', () => {
    expect(judgeLink({ scheme: 'https', hostname: '', path: '', queryParams: { state: 's', code: 'c' } }, scheme).kind).toBe('rejected');
    expect(link({ state: 's', code: 'c' }, { hostname: 'evil.test' }).kind).toBe('rejected');
    expect(link({ state: 's', code: 'c' }, { path: 'admin' }).kind).toBe('rejected');
  });

  it('checks the state against the open requests afterwards, so a made-up state still fails', () => {
    expect(consumePending([open('a')], 'made-up', NOW).ok).toBe(false);
    expect(consumePending([open('a')], '', NOW).ok).toBe(false);
  });
});
