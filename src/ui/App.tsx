import type { OpenEngine } from '../audio/protocol';
import { StoreContext, type Store } from '../state/store';
import { Session } from './Session';
import { Setup } from './Setup';

export function App({ store, openEngine }: { store: Store; openEngine: OpenEngine }) {
  return (
    <StoreContext.Provider value={store}>
      {store.screen.value === 'session' ? (
        <Session openEngine={openEngine} onExit={() => (store.screen.value = 'setup')} />
      ) : (
        <Setup openEngine={openEngine} />
      )}
    </StoreContext.Provider>
  );
}
