import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getProfile, updateBio } from '@/lib/api';
import { fetchJwt } from '@/lib/token';

// token.ts and config.ts pull in React Native (SecureStore, Platform); api.ts only needs their shape.
vi.mock('@/lib/config', () => ({ API_URL: 'https://api.test', WEB_URL: 'https://web.test' }));
vi.mock('@/lib/token', () => ({ fetchJwt: vi.fn() }));

const fetchJwtMock = vi.mocked(fetchJwt);
const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchJwtMock.mockResolvedValue({ ok: true, token: 'jwt-1' });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  fetchJwtMock.mockReset();
});

describe('getProfile', () => {
  it('sends the JWT as a Bearer token, with no cookies', async () => {
    fetchMock.mockResolvedValue(json({ user_id: 'u1', bio: 'hello' }));

    const result = await getProfile();

    expect(result).toEqual({ ok: true, data: { userId: 'u1', bio: 'hello' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/me/profile');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({ Authorization: 'Bearer jwt-1' });
  });

  it('does not call the API when no JWT can be had', async () => {
    fetchJwtMock.mockResolvedValue({ ok: false, reason: 'not signed in' });
    expect(await getProfile()).toEqual({ ok: false, reason: 'not signed in', status: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes on a 401 from the token endpoint as a 401', async () => {
    fetchJwtMock.mockResolvedValue({ ok: false, reason: 'token request failed (401)', status: 401 });
    const result = await getProfile();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('reports the status when the API refuses', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    expect(await getProfile()).toEqual({ ok: false, reason: 'request failed (401)', status: 401 });
  });

  it('tells a 500 from a 401 (a failure to reload, not a sign-out)', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    const result = await getProfile();
    expect(result).toEqual({ ok: false, reason: 'request failed (500)', status: 500 });
  });

  it.each([
    ['not JSON', new Response('<html>', { status: 200 })],
    ['null', json(null)],
    ['a missing bio', json({ user_id: 'u1' })],
    ['a bio that is not a string', json({ user_id: 'u1', bio: 5 })],
    ['a missing user_id', json({ bio: 'x' })],
  ])('rejects a 200 whose body is %s', async (_name, response) => {
    fetchMock.mockResolvedValue(response);
    expect(await getProfile()).toEqual({ ok: false, reason: 'unexpected response' });
  });

  it('fails without a status when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await getProfile()).toEqual({ ok: false, reason: 'request failed' });
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

    const pending = getProfile();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({ ok: false, reason: 'request timed out' });
  });
});

describe('updateBio', () => {
  it('PUTs the bio as JSON', async () => {
    fetchMock.mockResolvedValue(json({ user_id: 'u1', bio: 'new' }));

    const result = await updateBio('new');

    expect(result).toEqual({ ok: true, data: { userId: 'u1', bio: 'new' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/me/profile');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify({ bio: 'new' }));
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer jwt-1',
      'Content-Type': 'application/json',
    });
  });

  it('tells a 422 (bio refused) from a 401 (signed out)', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid' }, 422));
    expect(await updateBio('x')).toEqual({ ok: false, reason: 'request failed (422)', status: 422 });

    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    expect(await updateBio('x')).toEqual({ ok: false, reason: 'request failed (401)', status: 401 });
  });
});
