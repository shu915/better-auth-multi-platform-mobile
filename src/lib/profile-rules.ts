// The decisions the profile form makes, kept free of React Native so they can be tested on their
// own (the component only draws and calls the network).

export type Message = { kind: 'ok' | 'error'; text: string };

export type ProfileValues = {
  /** The name in the session (what is saved now). */
  name: string;
  nameDraft: string;
  /** The bio the Go API has (what is saved now). */
  savedBio: string;
  bioDraft: string;
};

// Only what changed is sent. The name is compared after trimming, like the web app does.
export function planSave(values: ProfileValues): { sendName: boolean; sendBio: boolean } {
  return {
    sendName: values.nameDraft.trim() !== values.name,
    sendBio: values.bioDraft !== values.savedBio,
  };
}

export const hasChanges = (values: ProfileValues): boolean => {
  const plan = planSave(values);
  return plan.sendName || plan.sendBio;
};

export const SAVED: Message = { kind: 'ok', text: 'Saved.' };

// What a failed save leads to: the form shows `message` and stays open with the user's text, except
// for a 401, where the session is gone and the parent signs the user out as well.
export type Failure = { message: Message; signOut: boolean };

// `status` is the HTTP status when the server answered (undefined: no answer). `refusal` is the
// text the web app gave for refusing a name (422), meant to be shown to the user.
type Failed = { status?: number; refusal?: string };

const SESSION_ENDED: Message = {
  kind: 'error',
  text: 'Your session may have ended. If you are still signed in, sign out and sign in again.',
};

export function nameFailure({ status, refusal }: Failed): Failure {
  if (status === 401) return { message: SESSION_ENDED, signOut: true };
  if (status === 422) {
    return {
      message: { kind: 'error', text: `The name was refused. ${refusal ?? ''}`.trim() },
      signOut: false,
    };
  }
  return {
    message: {
      kind: 'error',
      text: 'Could not save the name. Your text is kept. Check the connection and try again.',
    },
    signOut: false,
  };
}

// `nameSaved`: the name went through before the bio failed, so the user is told what did happen.
export function bioFailure({ status }: Failed, nameSaved: boolean): Failure {
  if (status === 401) return { message: SESSION_ENDED, signOut: true };
  const lead = nameSaved ? 'The name was saved, but the bio was not. ' : '';
  const text =
    status === 422
      ? `${lead}The bio was refused. Check that it is at most 1000 characters and has no unusual characters.`
      : `${lead}Could not save the bio. Your text is kept. Check the connection and try again.`;
  return { message: { kind: 'error', text }, signOut: false };
}
