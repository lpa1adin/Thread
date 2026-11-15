/** Состояние запуска: хранилище, защита паролем, автоблокировка (S1, S3, S7), установка PWA. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SecurityStatus } from '../core/types';
import { clearAttachmentUrls } from '../lib/attachments';
import { api, errorMessage } from '../lib/client';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

interface Session {
  storage: 'opfs' | 'memory';
  /** Браузер пообещал не удалять данные при нехватке места. */
  persisted: boolean;
  requestPersist(): Promise<boolean>;
  security: SecurityStatus;
  refreshSecurity(): Promise<void>;
  lock(): Promise<void>;
  autoLockMinutes: number;
  setAutoLockMinutes(m: number): void;
  canInstall: boolean;
  install(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);
const AUTOLOCK_KEY = 'kb.autolock';

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; storage: 'opfs' | 'memory' };

export function SessionProvider({ children, locked }: { children: ReactNode; locked: (s: Session) => ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [security, setSecurity] = useState<SecurityStatus>({ enabled: false, unlocked: true });
  const [persisted, setPersisted] = useState(false);
  const [autoLockMinutes, setAuto] = useState(() => Number(localStorage.getItem(AUTOLOCK_KEY) ?? 10));
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const lastActivity = useRef(Date.now());

  const refreshSecurity = useCallback(async () => setSecurity(await api.security.status()), []);

  useEffect(() => {
    (async () => {
      try {
        const { storage } = await api.boot.status();
        await refreshSecurity();
        // S7: просим браузер не удалять данные при нехватке места.
        const granted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
        setPersisted(granted);
        setBoot({ state: 'ready', storage });
      } catch (e) {
        setBoot({ state: 'error', message: errorMessage(e) });
      }
    })();
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', () => setInstallEvent(null));
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, [refreshSecurity]);

  const lock = useCallback(async () => {
    await api.security.lock();
    clearAttachmentUrls();
    await refreshSecurity();
  }, [refreshSecurity]);

  // S3: автоблокировка после заданного времени без действий пользователя.
  const active = security.enabled && security.unlocked && autoLockMinutes > 0;
  useEffect(() => {
    if (!active) return;
    lastActivity.current = Date.now();
    const touch = () => (lastActivity.current = Date.now());
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > autoLockMinutes * 60_000) void lock();
    }, 5000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, touch));
      window.clearInterval(timer);
    };
  }, [active, autoLockMinutes, lock]);

  if (boot.state === 'loading') return <div className="spinner" role="status" aria-label="Открываю базу знаний" />;
  if (boot.state === 'error') {
    return (
      <div className="error-box" role="alert">
        <h1>Нить не открылась</h1>
        <p className="muted">{boot.message}</p>
        <button className="btn btn--primary" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </div>
    );
  }

  const session: Session = {
    storage: boot.storage,
    persisted,
    requestPersist: async () => {
      const ok = (await navigator.storage?.persist?.()) ?? false;
      setPersisted(ok);
      return ok;
    },
    security,
    refreshSecurity,
    lock,
    autoLockMinutes,
    setAutoLockMinutes: (m) => {
      localStorage.setItem(AUTOLOCK_KEY, String(m));
      setAuto(m);
    },
    canInstall: !!installEvent,
    install: async () => {
      await installEvent?.prompt();
      setInstallEvent(null);
    },
  };

  return <SessionContext.Provider value={session}>{security.enabled && !security.unlocked ? locked(session) : children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession вне SessionProvider');
  return s;
}
