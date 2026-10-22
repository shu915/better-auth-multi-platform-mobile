import { describe, expect, it } from 'vitest';

import { deleteOutcome } from '@/lib/delete-rules';

describe('deleteOutcome', () => {
  it('says the account is deleted when the form is still up after a success, and signs out', () => {
    // The phone could not forget the session: the user must not think it failed and press again.
    const outcome = deleteOutcome({ ok: true });
    expect(outcome.deleted).toBe(true);
    expect(outcome.signOut).toBe(true);
    expect(outcome.message).toContain('Your account was deleted');
  });

  it('signs out only when the session is gone', () => {
    expect(deleteOutcome({ ok: false, kind: 'signed-out' }).signOut).toBe(true);
    for (const kind of ['email-mismatch', 'not-fresh', 'failed'] as const) {
      expect(deleteOutcome({ ok: false, kind }).signOut).toBe(false);
    }
  });

  it('never calls an account deleted after a failure', () => {
    for (const kind of ['email-mismatch', 'not-fresh', 'signed-out', 'failed'] as const) {
      expect(deleteOutcome({ ok: false, kind }).deleted).toBe(false);
    }
  });

  it('says what each failure is, in words that cannot be swapped', () => {
    const text = (kind: 'email-mismatch' | 'not-fresh' | 'signed-out' | 'failed') =>
      deleteOutcome({ ok: false, kind }).message;
    expect(text('email-mismatch')).toContain('not the email address');
    expect(text('signed-out')).toContain('session has ended');
    expect(text('failed')).toContain('Could not delete your account');
    expect(text('not-fresh')).toContain('sign in again');
  });

  it('has a different message for each failure', () => {
    const kinds = ['email-mismatch', 'not-fresh', 'signed-out', 'failed'] as const;
    const messages = kinds.map((kind) => deleteOutcome({ ok: false, kind }).message);
    expect(new Set(messages).size).toBe(kinds.length);
  });

  it('asks the user to sign in again, and soon, when the sign-in is too old', () => {
    const text = deleteOutcome({ ok: false, kind: 'not-fresh' }).message;
    expect(text).toContain('sign in again');
    expect(text).toContain('right away');
  });

  it('says repeating is safe after a failure', () => {
    expect(deleteOutcome({ ok: false, kind: 'failed' }).message).toContain('repeating it is safe');
  });
});
