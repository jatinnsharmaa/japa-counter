// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGoogleTokenProvider, DRIVE_SCOPE, loadGis, type GoogleOAuth2 } from '../../../src/storage/auth';

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

  it('never opens a popup in the background once the token has expired', async () => {
    let t = 0;
    const f = fakeGis(() => ({ access_token: 'x', expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => t });
    await get({ forceRefresh: false, interactive: true });
    t = 3_600_000;
    await expect(get({ forceRefresh: false, interactive: false })).rejects.toThrow('Drive needs a click to reconnect');
    expect(f.requests).toEqual(['consent']);
  });

  it('never opens a popup for a forced background refresh', async () => {
    const f = fakeGis(() => ({ access_token: 'x', expires_in: 3600 }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis, now: () => 0 });
    await get({ forceRefresh: false, interactive: true });
    await expect(get({ forceRefresh: true, interactive: false })).rejects.toThrow('Drive needs a click to reconnect');
    expect(f.requests).toEqual(['consent']);
  });

  it('gives up on a sign-in that never calls back', async () => {
    const gis: GoogleOAuth2 = { initTokenClient: () => ({ requestAccessToken: () => {} }) };
    const get = createGoogleTokenProvider('cid', { loadGis: async () => gis, tokenTimeoutMs: 20 });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow(/timed out/);
  });

  it('gives up when Google sign-in never loads', async () => {
    const get = createGoogleTokenProvider('cid', { loadGis: () => new Promise<GoogleOAuth2>(() => {}), tokenTimeoutMs: 20 });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow(/timed out/);
  });

  it('rejects on an OAuth error', async () => {
    const f = fakeGis(() => ({ error: 'access_denied' }));
    const get = createGoogleTokenProvider('cid', { loadGis: async () => f.gis });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow('access_denied');
  });
});

describe('loadGis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { google?: unknown }).google;
  });

  it('rejects when the script loads without google.accounts.oauth2, and can retry', async () => {
    // Stand in for the network: "load" the script without running it.
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
      queueMicrotask(() => (node as unknown as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
    await expect(loadGis()).rejects.toThrow('Could not load Google sign-in');
    const oauth2 = { initTokenClient: () => ({ requestAccessToken: () => {} }) };
    (window as { google?: unknown }).google = { accounts: { oauth2 } };
    await expect(loadGis()).resolves.toBe(oauth2);
  });

  it('forgets a stuck script load when sign-in times out, so the next Connect loads it again', async () => {
    vi.resetModules(); // fresh module state: no script load cached by earlier tests
    const auth = await import('../../../src/storage/auth');
    let loads = 0;
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
      if (++loads > 1) queueMicrotask(() => (node as unknown as HTMLScriptElement).onload?.(new Event('load')));
      return node; // the first load never finishes
    });
    const get = auth.createGoogleTokenProvider('cid', { tokenTimeoutMs: 20 });
    await expect(get({ forceRefresh: false, interactive: true })).rejects.toThrow(/timed out/);
    (window as { google?: unknown }).google = { accounts: { oauth2: fakeGis(() => ({ access_token: 'tok', expires_in: 3600 })).gis } };
    await expect(get({ forceRefresh: false, interactive: true })).resolves.toBe('tok');
    expect(loads).toBe(2);
  });
});
