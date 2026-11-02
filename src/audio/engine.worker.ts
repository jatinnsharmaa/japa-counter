import { EngineCore } from './engine-core';
import type { FromEngine, ToEngine } from './protocol';

const scope = self as unknown as {
  postMessage(msg: FromEngine, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToEngine>) => void) | null;
};
const core = new EngineCore((msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e) => core.handle(e.data);
