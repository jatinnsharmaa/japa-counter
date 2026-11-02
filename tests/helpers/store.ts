import 'fake-indexeddb/auto';
import { createStore, type Store } from '../../src/state/store';
import { openDb, putSample } from '../../src/storage/db';
import { makeSampleRecord } from './samples';

export async function makeStore(sampleSeeds: number[] = []): Promise<Store> {
  const db = await openDb(`test-${crypto.randomUUID()}`);
  for (const seed of sampleSeeds) await putSample(db, makeSampleRecord(seed));
  const store = createStore(db);
  await store.load();
  return store;
}
