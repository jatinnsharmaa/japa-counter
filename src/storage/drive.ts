export type TokenProvider = (opts: { forceRefresh: boolean; interactive: boolean }) => Promise<string>;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export interface DriveApi {
  ensureSamplesFolder(): Promise<string>;
  listFiles(folderId: string): Promise<DriveFile[]>;
  uploadFile(folderId: string, name: string, mimeType: string, body: ArrayBuffer | string, existingId?: string): Promise<string>;
  downloadFile(id: string): Promise<ArrayBuffer>;
  deleteFile(id: string): Promise<void>;
}

export const ROOT_FOLDER = 'Japa Counter';
export const SAMPLES_FOLDER = 'samples';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Minimal Drive REST v3 client for files this app creates (scope drive.file). */
export class DriveClient implements DriveApi {
  constructor(
    private readonly getToken: TokenProvider,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
    private readonly interactive = false,
  ) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken({ forceRefresh: attempt > 0, interactive: this.interactive });
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const res = await this.fetchFn(url, { ...init, headers });
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) throw new DriveError(res.status, `Drive request failed (${res.status})`);
      return res;
    }
    throw new DriveError(401, 'Drive authorisation failed');
  }

  async findFolder(name: string, parentId: string): Promise<string | null> {
    const q = `name='${esc(name)}' and mimeType='${FOLDER_MIME}' and '${esc(parentId)}' in parents and trashed=false`;
    const res = await this.request(`${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id)')}`);
    const { files } = (await res.json()) as { files: { id: string }[] };
    return files[0]?.id ?? null;
  }

  async createFolder(name: string, parentId: string): Promise<string> {
    const res = await this.request(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    return ((await res.json()) as { id: string }).id;
  }

  async ensureSamplesFolder(): Promise<string> {
    const root = (await this.findFolder(ROOT_FOLDER, 'root')) ?? (await this.createFolder(ROOT_FOLDER, 'root'));
    return (await this.findFolder(SAMPLES_FOLDER, root)) ?? (await this.createFolder(SAMPLES_FOLDER, root));
  }

  async listFiles(folderId: string): Promise<DriveFile[]> {
    const q = `'${esc(folderId)}' in parents and trashed=false`;
    const res = await this.request(`${API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType)')}&pageSize=1000`);
    return ((await res.json()) as { files: DriveFile[] }).files;
  }

  async uploadFile(folderId: string, name: string, mimeType: string, body: ArrayBuffer | string, existingId?: string): Promise<string> {
    if (existingId) {
      const res = await this.request(`${UPLOAD}/${existingId}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body,
      });
      return ((await res.json()) as { id: string }).id;
    }
    const boundary = `japa${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: [folderId], mimeType });
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      body,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    return ((await res.json()) as { id: string }).id;
  }

  async downloadFile(id: string): Promise<ArrayBuffer> {
    return (await this.request(`${API}/${id}?alt=media`)).arrayBuffer();
  }

  async deleteFile(id: string): Promise<void> {
    try {
      await this.request(`${API}/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof DriveError && err.status === 404) return;
      throw err;
    }
  }
}
