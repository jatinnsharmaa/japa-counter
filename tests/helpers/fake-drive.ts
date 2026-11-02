import type { DriveApi, DriveFile } from '../../src/storage/drive';

export type DriveOp = 'ensureSamplesFolder' | 'listFiles' | 'uploadFile' | 'downloadFile' | 'deleteFile';

export class FakeDrive implements DriveApi {
  files = new Map<string, { name: string; folderId: string; body: ArrayBuffer | string }>();
  uploads = 0;
  deletes = 0;
  /** Every call, in order. */
  calls: DriveOp[] = [];
  /**
   * Runs at the start of every call, while it is "in flight" (before it takes effect).
   * `arg` is the folder id for listFiles, the file name for uploadFile, the file id for downloadFile and deleteFile.
   */
  onCall: ((op: DriveOp, arg?: string) => void | Promise<void>) | null = null;
  private next = 1;
  readonly folderId = 'FOLDER';

  private async enter(op: DriveOp, arg?: string): Promise<void> {
    this.calls.push(op);
    await this.onCall?.(op, arg);
  }

  async ensureSamplesFolder(): Promise<string> {
    await this.enter('ensureSamplesFolder');
    return this.folderId;
  }

  async listFiles(folderId: string): Promise<DriveFile[]> {
    await this.enter('listFiles', folderId);
    return [...this.files.entries()]
      .filter(([, f]) => f.folderId === folderId)
      .map(([id, f]) => ({ id, name: f.name, mimeType: f.name.endsWith('.json') ? 'application/json' : 'audio/wav' }));
  }

  async uploadFile(folderId: string, name: string, _mime: string, body: ArrayBuffer | string, existingId?: string): Promise<string> {
    await this.enter('uploadFile', name);
    this.uploads++;
    const id = existingId ?? `F${this.next++}`;
    this.files.set(id, { name, folderId, body });
    return id;
  }

  async downloadFile(id: string): Promise<ArrayBuffer> {
    await this.enter('downloadFile', id);
    const f = this.files.get(id);
    if (!f) throw new Error(`missing ${id}`);
    return typeof f.body === 'string' ? new TextEncoder().encode(f.body).buffer : f.body;
  }

  async deleteFile(id: string): Promise<void> {
    await this.enter('deleteFile', id);
    this.deletes++;
    this.files.delete(id);
  }

  manifestText(): string | undefined {
    const m = [...this.files.values()].find((f) => f.name === 'manifest.json');
    return m && (typeof m.body === 'string' ? m.body : new TextDecoder().decode(m.body));
  }

  wavIds(): string[] {
    return [...this.files.entries()].filter(([, f]) => f.name.endsWith('.wav')).map(([id]) => id);
  }

  /** Puts `n` copies of one sample's WAV in the folder, each with its own manifest entry (cheap way to fill Drive). */
  seedSamples(n: number, wav: ArrayBuffer, entry: { durationSec: number; trimStart: number; trimEnd: number; floor: number; engineVersion: number }): void {
    const samples = Array.from({ length: n }, (_, i) => {
      const fileId = `SEED${i}`;
      this.files.set(fileId, { name: `seed-${i}.wav`, folderId: this.folderId, body: wav });
      return { sampleId: `seed-${i}`, fileId, createdAt: 1_600_000_000_000 + i, ...entry };
    });
    this.files.set('MANIFEST', { name: 'manifest.json', folderId: this.folderId, body: JSON.stringify({ version: 1, samples }) });
  }
}
