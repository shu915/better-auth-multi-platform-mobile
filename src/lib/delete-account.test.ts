import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteAccount } from '@/lib/delete-account';
import { clearLocalSession } from '@/lib/local-session';
import { getSessionToken } from '@/lib/token';

vi.mock('@/lib/config', () => ({ WEB_URL: 'https://web.test' }));
vi.mock('@/lib/token', () => ({ getSessionToken: vi.fn() }));
vi.mock('@/lib/local-session', () => ({ clearLocalSession: vi.fn() }));

const tokenMock = vi.mocked(getSessionToken);
const clearMock = vi.mocked(clearLocalSession);
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  tokenMock.mockResolvedValue('session-token');
  clearMock.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  tokenMock.mockReset();
  clearMock.mockReset();
});

describe('deleteAccount', () => {
  it('DELETEs with the typed email, the session token as Bearer, and no cookies', async () => {
    fetchMock.mockResolvedValue(json({ deleted: true }));

    expect(await deleteAccount('me@example.com')).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://web.test/api/mobile/account');
    expect(init?.method).toBe('DELETE');
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer session-token',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe(JSON.stringify({ confirmEmail: 'me@example.com' }));
  });

  it('forgets the session on the phone after the account is deleted, and only then', async () => {
    fetchMock.mockResolvedValue(json({ deleted: true }));
    await deleteAccount('me@example.com');
    expect(clearMock).toHaveBeenCalledTimes(1);

    clearMock.mockClear();
    fetchMock.mockResolvedValue(json({ error: 'failed' }, 500));
    await deleteAccount('me@example.com');
    expect(clearMock).not.toHaveBeenCalled();
  });

  it('still reports success when the phone cannot forget the session', async () => {
    fetchMock.mockResolvedValue(json({ deleted: true }));
    clearMock.mockRejectedValue(new Error('keychain locked'));
    expect(await deleteAccount('me@example.com')).toEqual({ ok: true });
  });

  it.each([
    [422, 'email-mismatch'],
    [403, 'not-fresh'],
    [401, 'signed-out'],
    [500, 'failed'],
    [503, 'failed'],
    [413, 'failed'],
  ])('maps a %i answer to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({ error: 'x' }, status));
    expect(await deleteAccount('me@example.com')).toEqual({ ok: false, kind });
  });

  it('is signed out, without calling the web app, when there is no session', async () => {
    tokenMock.mockResolvedValue(undefined);
    expect(await deleteAccount('me@example.com')).toEqual({ ok: false, kind: 'signed-out' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a failure when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await deleteAccount('me@example.com')).toEqual({ ok: false, kind: 'failed' });
    expect(clearMock).not.toHaveBeenCalled();
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const pending = deleteAccount('me@example.com');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, kind: 'failed' });
  });
});
