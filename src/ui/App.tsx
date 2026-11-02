import type { OpenEngine } from '../audio/protocol';
import { StoreContext, type Store } from '../state/store';
import { Setup } from './Setup';

export function App({ store, openEngine }: { store: Store; openEngine: OpenEngine }) {
  return (
    <StoreContext.Provider value={store}>
      <Setup openEngine={openEngine} />
    </StoreContext.Provider>
  );
}
