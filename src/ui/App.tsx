import { useLayoutEffect } from 'preact/hooks';
import type { OpenEngine } from '../audio/protocol';
import { DriveContext, type DriveController } from '../state/drive-controller';
import { StoreContext, type Store } from '../state/store';
import { Session } from './Session';
import { Setup } from './Setup';

export function App({ store, openEngine, drive }: { store: Store; openEngine: OpenEngine; drive: DriveController | null }) {
  useLayoutEffect(() => {
    void drive?.start();
    return () => drive?.stop();
  }, [drive]);
  return (
    <StoreContext.Provider value={store}>
      <DriveContext.Provider value={drive}>
        {store.screen.value === 'session' ? (
          <Session openEngine={openEngine} onExit={() => (store.screen.value = 'setup')} />
        ) : (
          <Setup openEngine={openEngine} />
        )}
      </DriveContext.Provider>
    </StoreContext.Provider>
  );
}
