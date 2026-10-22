import { describe, expect, it } from 'vitest';

import { bioFailure, hasChanges, nameFailure, planSave, SAVED } from '@/lib/profile-rules';

const values = { name: 'Alice', nameDraft: 'Alice', savedBio: 'hello', bioDraft: 'hello' };

describe('planSave', () => {
  it('sends nothing when nothing changed', () => {
    expect(planSave(values)).toEqual({ sendName: false, sendBio: false });
    expect(hasChanges(values)).toBe(false);
  });

  it('sends only the name, or only the bio, when only that changed', () => {
    expect(planSave({ ...values, nameDraft: 'Bob' })).toEqual({ sendName: true, sendBio: false });
    expect(planSave({ ...values, bioDraft: 'bye' })).toEqual({ sendName: false, sendBio: true });
    expect(hasChanges({ ...values, bioDraft: 'bye' })).toBe(true);
  });

  it('sends both when both changed', () => {
    expect(planSave({ ...values, nameDraft: 'Bob', bioDraft: 'bye' })).toEqual({
      sendName: true,
      sendBio: true,
    });
  });

  it('compares the name after trimming, like the web app (spaces alone are no change)', () => {
    expect(planSave({ ...values, nameDraft: '  Alice  ' }).sendName).toBe(false);
    expect(planSave({ ...values, nameDraft: ' Bob ' }).sendName).toBe(true);
  });

  it('does not trim the bio', () => {
    expect(planSave({ ...values, bioDraft: 'hello ' }).sendBio).toBe(true);
  });

  it('treats an emptied name as a change, so the web app can refuse it', () => {
    expect(planSave({ ...values, nameDraft: '' }).sendName).toBe(true);
  });
});

describe('nameFailure', () => {
  it('signs the user out on a 401', () => {
    expect(nameFailure({ status: 401 }).signOut).toBe(true);
  });

  it('shows the web app’s reason for a 422, and does not sign out', () => {
    const failure = nameFailure({ status: 422, refusal: 'Enter a name.' });
    expect(failure).toEqual({
      message: { kind: 'error', text: 'The name was refused. Enter a name.' },
      signOut: false,
    });
  });

  it('copes with a 422 that gave no reason', () => {
    expect(nameFailure({ status: 422 }).message.text).toBe('The name was refused.');
  });

  it('keeps the text and offers a retry on any other failure, including no answer', () => {
    for (const status of [undefined, 500, 503, 413]) {
      const failure = nameFailure({ status });
      expect(failure.signOut).toBe(false);
      expect(failure.message.kind).toBe('error');
      expect(failure.message.text).toContain('Your text is kept');
    }
  });
});

describe('bioFailure', () => {
  it('signs the user out on a 401, even after the name was saved', () => {
    expect(bioFailure({ status: 401 }, false).signOut).toBe(true);
    expect(bioFailure({ status: 401 }, true).signOut).toBe(true);
  });

  it('tells a 422 (refused) from a failure to reach the server', () => {
    expect(bioFailure({ status: 422 }, false).message.text).toContain('The bio was refused');
    expect(bioFailure({ status: 500 }, false).message.text).toContain('Could not save the bio');
    expect(bioFailure({}, false).message.text).toContain('Could not save the bio');
  });

  it('says the name was saved when only the bio failed', () => {
    for (const status of [undefined, 422, 500]) {
      expect(bioFailure({ status }, true).message.text).toMatch(/^The name was saved, but the bio was not\./);
      expect(bioFailure({ status }, false).message.text).not.toContain('The name was saved');
    }
  });

  it('never signs out for a 422', () => {
    expect(bioFailure({ status: 422 }, true).signOut).toBe(false);
  });
});

describe('SAVED', () => {
  it('is an ok message', () => {
    expect(SAVED.kind).toBe('ok');
  });
});
