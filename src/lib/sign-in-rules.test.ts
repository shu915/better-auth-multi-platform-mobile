import { describe, expect, it } from 'vitest';

import {
  addPending,
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
const open = (state: string, ageMs = 0): Pending => ({ state, createdAt: NOW - ageMs });

describe('consumePending', () => {
  it('accepts the state of an open request, and uses it up', () => {
    const result = consumePending([open('a')], 'a', NOW);
    expect(result).toEqual({ ok: true, rest: [] });
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
    expect(result).toEqual({ ok: true, rest: [] });
    const other = consumePending([open('old', PENDING_MAX_AGE_MS + 1), open('live')], 'x', NOW);
    expect(other).toEqual({ ok: false, reason: 'mismatch', rest: [open('live')] });
  });

  it('uses up only the request that matched', () => {
    const result = consumePending([open('a'), open('b'), open('c')], 'b', NOW);
    expect(result).toEqual({ ok: true, rest: [open('a'), open('c')] });
  });
});

describe('addPending and removePending', () => {
  it('keeps a mail that is already in the inbox usable when the user asks for another', () => {
    // The first mail (state A) is out. The second request may get no mail at all (the web app
    // answers the same whether or not it sent one), so A must still be accepted.
    const list = addPending(addPending([], 'A', NOW), 'B', NOW + 1000);
    expect(consumePending(list, 'A', NOW + 2000).ok).toBe(true);
  });

  it('keeps only the newest MAX_PENDING requests', () => {
    let list: Pending[] = [];
    for (let i = 0; i < MAX_PENDING + 2; i++) list = addPending(list, `s${i}`, NOW + i);
    expect(list.map((p) => p.state)).toEqual(['s2', 's3', 's4']);
  });

  it('drops expired requests when a new one is added', () => {
    const list = addPending([open('old', PENDING_MAX_AGE_MS + 1)], 'new', NOW);
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
      { state: '', createdAt: NOW },
      { state: 'no-time' },
      { state: 5, createdAt: NOW },
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
