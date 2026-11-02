import { StoreContext, type Store } from '../state/store';
import { Setup } from './Setup';

export function App({ store }: { store: Store }) {
  return (
    <StoreContext.Provider value={store}>
      <Setup />
    </StoreContext.Provider>
  );
}
