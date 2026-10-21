import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient } from '@/lib/auth-client';
import { clearLocalSession } from '@/lib/local-session';
import * as SecureStore from 'expo-secure-store';

vi.mock('@/lib/config', () => ({ STORAGE_PREFIX: 'app' }));
vi.mock('expo-secure-store', () => ({ deleteItemAsync: vi.fn() }));
vi.mock('@/lib/auth-client', () => {
  const set = vi.fn();
  return {
    authClient: {
      $store: {
        atoms: { session: { get: () => ({ data: { user: 'old' }, error: null, isPending: false }), set } },
        notify: vi.fn(),
      },
    },
  };
});

const deleteItem = vi.mocked(SecureStore.deleteItemAsync);
const session = authClient.$store.atoms.session;
const notify = vi.mocked(authClient.$store.notify);

beforeEach(() => {
  vi.clearAllMocks();
  deleteItem.mockResolvedValue(undefined);
});

describe('clearLocalSession', () => {
  it('deletes the stored cookie and session data', async () => {
    await clearLocalSession();
    expect(deleteItem.mock.calls.map(([key]) => key).sort()).toEqual(['app_cookie', 'app_session_data']);
  });

  it('sets the in-memory session to "no user" without waiting for a reload', async () => {
    await clearLocalSession();
    expect(vi.mocked(session.set)).toHaveBeenCalledWith({ data: null, error: null, isPending: false });
  });

  it('also asks for a reload', async () => {
    await clearLocalSession();
    expect(notify).toHaveBeenCalledWith('$sessionSignal');
  });

  it('does not change the in-memory session when the stored values cannot be deleted', async () => {
    deleteItem.mockRejectedValue(new Error('keychain locked'));
    await expect(clearLocalSession()).rejects.toThrow();
    expect(vi.mocked(session.set)).not.toHaveBeenCalled();
  });
});
