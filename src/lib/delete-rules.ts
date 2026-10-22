import type { DeleteResult } from '@/lib/delete-account';

// What the delete form does with the answer (the component only draws it and calls the parent).
export type DeleteOutcome = {
  /** Shown under the form. */
  message: string;
  /** Ask the parent to sign out (the session is gone, or the account is gone). */
  signOut: boolean;
  /** The account is deleted, yet this screen is still up: the parent keeps the profile locked. */
  deleted: boolean;
};

const MESSAGES = {
  'email-mismatch': 'That is not the email address of this account.',
  'not-fresh':
    'For security, sign out, sign in again with an email link, then delete your account right away (within a few minutes).',
  'signed-out': 'Your session has ended.',
  failed: 'Could not delete your account. Check the connection and try again; repeating it is safe.',
} satisfies Record<Extract<DeleteResult, { ok: false }>['kind'], string>;

// A success normally takes the app to the sign-in screen before this runs, and the form is gone.
// Reaching here with ok means the account is deleted but the phone could not forget the session:
// say so (the user must not think it failed and press again), keep the profile locked, and finish
// through the sign-out path.
export function deleteOutcome(result: DeleteResult): DeleteOutcome {
  if (result.ok) {
    return {
      message:
        'Your account was deleted. If this screen stays, close and reopen the app to finish signing out.',
      signOut: true,
      deleted: true,
    };
  }
  return {
    message: MESSAGES[result.kind],
    signOut: result.kind === 'signed-out',
    deleted: false,
  };
}
