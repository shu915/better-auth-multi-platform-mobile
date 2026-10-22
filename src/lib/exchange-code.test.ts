import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exchangeCode } from '@/lib/exchange-code';

vi.mock('@/lib/config', () => ({ WEB_URL: 'https://web.test' }));

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('exchangeCode', () => {
  it('POSTs the code and the verifier, with no cookies and no authorization', async () => {
    fetchMock.mockResolvedValue(json({ cookie: 'better-auth.session_token=abc; Path=/' }));

    expect(await exchangeCode('the-code', 'the-verifier')).toEqual({
      ok: true,
      cookie: 'better-auth.session_token=abc; Path=/',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://web.test/api/mobile/exchange');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ code: 'the-code', verifier: 'the-verifier' }));
  });

  it('is a refusal on a 400, and does not return what the server said', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_code', detail: 'secret detail' }, 400));
    const result = await exchangeCode('c', 'v');
    expect(result).toEqual({ ok: false, reason: 'exchange refused (400)' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it.each([
    ['a 200 with no cookie', json({})],
    ['a 200 with an empty cookie', json({ cookie: '' })],
    ['a 200 whose cookie is not a string', json({ cookie: 5 })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
  ])('is not a success for %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response);
    expect((await exchangeCode('c', 'v')).ok).toBe(false);
  });

  it('is a failure when the network is down', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await exchangeCode('c', 'v')).toEqual({ ok: false, reason: 'exchange failed' });
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
    const pending = exchangeCode('c', 'v');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ ok: false, reason: 'exchange timed out' });
  });
});
