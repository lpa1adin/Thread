import { Overlays } from '../components/ui/Overlays';
import { LockScreen } from '../features/settings/LockScreen';
import { BaseProvider } from './base';
import { SessionProvider } from './session';
import { Shell } from './Shell';

export function App() {
  return (
    <>
      <SessionProvider locked={(session) => <LockScreen onUnlocked={session.refreshSecurity} />}>
        <BaseProvider>
          <Shell />
        </BaseProvider>
      </SessionProvider>
      <Overlays />
    </>
  );
}
