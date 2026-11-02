import { describe, expect, it } from 'vitest';
import { createGoogleTokenProvider, DRIVE_SCOPE, type GoogleOAuth2 } from '../../../src/storage/auth';

function fakeGis(reply: () => { access_token?: string; expires_in?: number; error?: string }) {
  const requests: (string | undefined)[] = [];
  let config: Parameters<GoogleOAuth2['initTokenClient']>[0] | null = null;
  const gis: GoogleOAuth2 = {
    initTokenClient(c) {
      config = c;
      return { requestAccessToken: (o) => { requests.push(o?.prompt); queueMicrotask(() => c.callback(reply())); } };
    },
  };
  return { gis, requests, config: () => config };
}

describe('createGoogleTokenProvider', () => {
  it('asks for drive.file consent the first time and caches the token', async () => {
    let n = 0;
    const f = fakeGis(() => ({ access_token: `t${++n}`, expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => 0 });
    expect(await get({ forceRefresh: false, interactive: true })).toBe('t1');
    expect(f.config()).toMatchObject({ client_id: 'cid', scope: DRIVE_SCOPE });
    expect(await get({ forceRefresh: false, interactive: false })).toBe('t1');
    expect(f.requests).toEqual(['consent']);
  });

  it('refreshes silently when forced or expired', async () => {
    let n = 0;
    let t = 0;
    const f = fakeGis(() => ({ access_token: `t${++n}`, expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => t });
    await get({ forceRefresh: false, interactive: true });
    expect(await get({ forceRefresh: true, interactive: true })).toBe('t2');
    t = 3_600_000;
    expect(await get({ forceRefresh: false, interactive: true })).toBe('t3');
    expect(f.requests).toEqual(['consent', '', '']);
  });

  it('never opens a popup when not interactive and no token is cached', async () => {
    const f = fakeGis(() => ({ access_token: 'x', expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis });
    await expect(get({ forceRefresh: false, interactive: false })).rejects.toThrow('Drive needs a click to reconnect');
    expect(f.requests).toEqual([]);
  });

  it('rejects on an OAuth error', async () => {
    const f = fakeGis(() => ({ error: 'access_denied' }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow('access_denied');
  });
});
