import { describe, expect, it } from 'vitest';

import {
  afterLinkAttempt,
  findLinked,
  linkFailure,
  NOT_LINKED_MESSAGE,
  toAccounts,
  unlinkFailure,
} from '@/lib/linked-accounts-rules';

const google = { id: 'acc-1', providerId: 'google' };
const credential = { id: 'acc-2', providerId: 'credential' };

describe('findLinked', () => {
  it('finds the account of a provider, by the provider name, and gives its row id', () => {
    expect(findLinked([credential, google], 'google')).toEqual(google);
  });

  it('is null when the provider is not linked', () => {
    expect(findLinked([credential], 'google')).toBeNull();
    expect(findLinked([], 'google')).toBeNull();
  });
});

describe('afterLinkAttempt', () => {
  // The browser comes back the same way for a link, a cancel and a refusal: the accounts tell.
  it('is linked when Google is among the accounts afterwards', () => {
    expect(afterLinkAttempt([google], 'google')).toBe('linked');
  });

  it('is not linked when it is not, whatever the browser said (cancelled, refused, closed)', () => {
    expect(afterLinkAttempt([], 'google')).toBe('not-linked');
    expect(afterLinkAttempt([credential], 'google')).toBe('not-linked');
  });

  it('has a message for the not-linked case that does not blame anyone', () => {
    expect(NOT_LINKED_MESSAGE).toContain('not linked');
  });
});

describe('linkFailure and unlinkFailure', () => {
  it('sign the user out on a 401, and say the session has ended', () => {
    expect(linkFailure({ status: 401 })).toEqual({ message: 'Your session has ended.', signOut: true });
    expect(unlinkFailure({ status: 401 })).toEqual({ message: 'Your session has ended.', signOut: true });
  });

  it('tell the user how to fix a sign-in that is too old, and say which they were doing', () => {
    const link = linkFailure({ status: 403, code: 'SESSION_NOT_FRESH' });
    const unlink = unlinkFailure({ status: 403, code: 'SESSION_NOT_FRESH' });
    expect(link.signOut).toBe(false);
    expect(link.message).toContain('sign in again');
    expect(link.message).toContain('linking');
    expect(link.message).toContain('right away');
    expect(unlink.message).toContain('unlinking');
  });

  it('ask for a retry on anything else, with no answer at all included, and show no raw message', () => {
    for (const error of [undefined, null, {}, { status: 500, message: 'secret detail' }, { status: 429 }]) {
      const link = linkFailure(error);
      const unlink = unlinkFailure(error);
      expect(link.signOut).toBe(false);
      expect(unlink.signOut).toBe(false);
      expect(link.message).toContain('Could not start linking Google');
      expect(unlink.message).toContain('Could not unlink Google');
      expect(link.message).not.toContain('secret');
    }
  });

  it('treat a 403 for another reason as a plain failure, not as a too-old sign-in', () => {
    expect(linkFailure({ status: 403, code: 'SERVER_ONLY' }).message).toContain('Could not start linking');
  });
});

describe('toAccounts', () => {
  it('reads the accounts Better Auth answered with', () => {
    expect(toAccounts([{ id: 'a', providerId: 'google', extra: 1 }, { id: 'b', providerId: 'credential' }])).toEqual([
      { id: 'a', providerId: 'google' },
      { id: 'b', providerId: 'credential' },
    ]);
  });

  it('is null when what came back is not a list', () => {
    for (const value of [null, undefined, {}, 'x', 5]) expect(toAccounts(value)).toBeNull();
  });

  it('skips entries that are not an account with an id and a provider', () => {
    expect(toAccounts([null, 'x', { id: '', providerId: 'google' }, { id: 'a' }, { providerId: 'google' }, { id: 5, providerId: 'google' }])).toEqual([]);
  });
});
