import type { DriveApi, DriveFile } from '../../src/storage/drive';

export class FakeDrive implements DriveApi {
  files = new Map<string, { name: string; folderId: string; body: ArrayBuffer | string }>();
  uploads = 0;
  deletes = 0;
  private next = 1;
  readonly folderId = 'FOLDER';

  async ensureSamplesFolder(): Promise<string> {
    return this.folderId;
  }

  async listFiles(folderId: string): Promise<DriveFile[]> {
    return [...this.files.entries()]
      .filter(([, f]) => f.folderId === folderId)
      .map(([id, f]) => ({ id, name: f.name, mimeType: f.name.endsWith('.json') ? 'application/json' : 'audio/wav' }));
  }

  async uploadFile(folderId: string, name: string, _mime: string, body: ArrayBuffer | string, existingId?: string): Promise<string> {
    this.uploads++;
    const id = existingId ?? `F${this.next++}`;
    this.files.set(id, { name, folderId, body });
    return id;
  }

  async downloadFile(id: string): Promise<ArrayBuffer> {
    const f = this.files.get(id);
    if (!f) throw new Error(`missing ${id}`);
    return typeof f.body === 'string' ? new TextEncoder().encode(f.body).buffer : f.body;
  }

  async deleteFile(id: string): Promise<void> {
    this.deletes++;
    this.files.delete(id);
  }

  manifestText(): string | undefined {
    const m = [...this.files.values()].find((f) => f.name === 'manifest.json');
    return m && (typeof m.body === 'string' ? m.body : new TextDecoder().decode(m.body));
  }
}
