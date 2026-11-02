import { describe, expect, it, vi } from 'vitest';
import { DriveClient, DriveError } from '../../../src/storage/drive';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const c: Call = { url: String(input), method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body };
    calls.push(c);
    return handler(c);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const tokens = () => {
  let n = 0;
  return vi.fn(async () => `tok-${++n}`);
};

describe('DriveClient', () => {
  it('creates Japa Counter/samples when missing and reuses it when present', async () => {
    const created: string[] = [];
    const { fn, calls } = mockFetch((c) => {
      if (c.method === 'GET') return json({ files: created.length === 2 && c.url.includes('samples') ? [{ id: 'S' }] : [] });
      const body = JSON.parse(String(c.body));
      created.push(body.name);
      return json({ id: body.name === 'Japa Counter' ? 'R' : 'S' });
    });
    const drive = new DriveClient(tokens(), fn);
    expect(await drive.ensureSamplesFolder()).toBe('S');
    expect(created).toEqual(['Japa Counter', 'samples']);
    const post = calls.filter((c) => c.method === 'POST').map((c) => JSON.parse(String(c.body)));
    expect(post[0]).toMatchObject({ name: 'Japa Counter', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] });
    expect(post[1]).toMatchObject({ name: 'samples', parents: ['R'] });
    expect(decodeURIComponent(calls[0].url)).toContain("name='Japa Counter' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false");
  });

  it('sends the bearer token and refreshes once on 401', async () => {
    const getToken = tokens();
    let first = true;
    const { fn, calls } = mockFetch(() => {
      if (first) {
        first = false;
        return new Response('', { status: 401 });
      }
      return json({ files: [] });
    });
    const drive = new DriveClient(getToken, fn);
    expect(await drive.listFiles('F')).toEqual([]);
    expect(calls.map((c) => c.headers.authorization)).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true, interactive: false });
  });

  it('throws DriveError when the refreshed token is also rejected', async () => {
    const { fn } = mockFetch(() => new Response('', { status: 401 }));
    await expect(new DriveClient(tokens(), fn).listFiles('F')).rejects.toBeInstanceOf(DriveError);
  });

  it('uploads new files as multipart and updates existing ones with PATCH', async () => {
    const { fn, calls } = mockFetch((c) => json({ id: c.method === 'POST' ? 'NEW' : 'OLD' }));
    const drive = new DriveClient(tokens(), fn);
    expect(await drive.uploadFile('F', 'a.wav', 'audio/wav', new ArrayBuffer(4))).toBe('NEW');
    expect(calls[0].url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    expect(calls[0].headers['content-type']).toMatch(/^multipart\/related; boundary=/);
    const text = await new Response(calls[0].body as BodyInit).text();
    expect(text).toContain('"name":"a.wav"');
    expect(text).toContain('"parents":["F"]');
    expect(await drive.uploadFile('F', 'm.json', 'application/json', '{}', 'OLD')).toBe('OLD');
    expect(calls[1]).toMatchObject({ method: 'PATCH', url: 'https://www.googleapis.com/upload/drive/v3/files/OLD?uploadType=media&fields=id' });
  });

  it('downloads file bytes and treats deleting a missing file as done', async () => {
    const { fn, calls } = mockFetch((c) => (c.method === 'DELETE' ? new Response('', { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))));
    const drive = new DriveClient(tokens(), fn);
    expect(new Uint8Array(await drive.downloadFile('X'))).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/X?alt=media');
    await expect(drive.deleteFile('X')).resolves.toBeUndefined();
  });

  it("escapes quotes in folder names", async () => {
    const { fn, calls } = mockFetch(() => json({ files: [{ id: 'Q' }] }));
    const drive = new DriveClient(tokens(), fn);
    await drive.findFolder("O'Brien", 'root');
    expect(decodeURIComponent(calls[0].url)).toContain("name='O\\'Brien'");
  });
});
