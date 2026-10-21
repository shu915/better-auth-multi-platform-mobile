import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient } from '@/lib/auth-client';
import { updateName } from '@/lib/profile-name';
import { getSessionToken } from '@/lib/token';

vi.mock('@/lib/config', () => ({ API_URL: 'https://api.test', WEB_URL: 'https://web.test' }));
vi.mock('@/lib/token', () => ({ getSessionToken: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { $store: { notify: vi.fn() } } }));

const tokenMock = vi.mocked(getSessionToken);
const notify = vi.mocked(authClient.$store.notify);
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  tokenMock.mockResolvedValue('session-token');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  tokenMock.mockReset();
  notify.mockReset();
});

describe('updateName', () => {
  it('PATCHes the name with the session token as Bearer, and no cookies', async () => {
    fetchMock.mockResolvedValue(json({ name: 'Alice' }));

    expect(await updateName('Alice')).toEqual({ ok: true, name: 'Alice' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://web.test/api/mobile/profile');
    expect(init?.method).toBe('PATCH');
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer session-token',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe(JSON.stringify({ name: 'Alice' }));
  });

  it('has the session read the user again after a save, and only then', async () => {
    fetchMock.mockResolvedValue(json({ name: 'Alice' }));
    await updateName('Alice');
    expect(notify).toHaveBeenCalledWith('$sessionSignal');

    notify.mockReset();
    fetchMock.mockResolvedValue(json({ errors: { name: 'Enter a name.' } }, 422));
    await updateName('');
    expect(notify).not.toHaveBeenCalled();
  });

  it('is a 401 without calling the web app when there is no session', async () => {
    tokenMock.mockResolvedValue(undefined);
    expect(await updateName('Alice')).toEqual({ ok: false, reason: 'not signed in', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells a 422 (with the reason) from a 401', async () => {
    fetchMock.mockResolvedValue(json({ errors: { name: 'Use 50 characters or fewer.' } }, 422));
    expect(await updateName('x')).toEqual({
      ok: false,
      reason: 'request failed (422)',
      status: 422,
      message: 'Use 50 characters or fewer.',
    });

    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    const result = await updateName('x');
    expect(result.ok === false && result.status).toBe(401);
  });

  it('rejects a 200 without a name', async () => {
    fetchMock.mockResolvedValue(json({}));
    expect(await updateName('x')).toEqual({ ok: false, reason: 'unexpected response' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('fails without a status when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await updateName('x')).toEqual({ ok: false, reason: 'request failed' });
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
    const pending = updateName('x');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ ok: false, reason: 'request timed out' });
  });
});
