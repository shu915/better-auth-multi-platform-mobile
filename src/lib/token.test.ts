import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient } from '@/lib/auth-client';
import { fetchJwt } from '@/lib/token';

vi.mock('@/lib/config', () => ({ API_URL: 'https://api.test', WEB_URL: 'https://web.test' }));
vi.mock('@/lib/auth-client', () => ({ authClient: { getCookie: vi.fn() } }));

const getCookie = vi.mocked(authClient.getCookie);
const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  getCookie.mockReset();
});

describe('fetchJwt', () => {
  it('sends only the session token as Bearer, with no Cookie header', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=abc.def; other=1');
    fetchMock.mockResolvedValue(json({ token: 'jwt-1' }));

    expect(await fetchJwt()).toEqual({ ok: true, token: 'jwt-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://web.test/api/auth/token');
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({ Authorization: 'Bearer abc.def' });
  });

  it('reads the __Secure- prefixed cookie name too', async () => {
    getCookie.mockResolvedValue('x=1; __Secure-better-auth.session_token=tok');
    fetchMock.mockResolvedValue(json({ token: 'jwt-1' }));
    await fetchJwt();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('does not call the web app when there is no session', async () => {
    getCookie.mockResolvedValue('');
    expect(await fetchJwt()).toEqual({ ok: false, reason: 'not signed in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the status of a refusal, and not the body', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=abc');
    fetchMock.mockResolvedValue(json({ message: 'secret detail' }, 401));
    expect(await fetchJwt()).toEqual({
      ok: false,
      reason: 'token request failed (401)',
      status: 401,
    });
  });

  it('refuses a 200 without a token', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=abc');
    fetchMock.mockResolvedValue(json({ token: '' }));
    const result = await fetchJwt();
    expect(result.ok).toBe(false);
  });

  it('fails without a status when the network is down', async () => {
    getCookie.mockResolvedValue('better-auth.session_token=abc');
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await fetchJwt()).toEqual({ ok: false, reason: 'token request failed' });
  });
});
