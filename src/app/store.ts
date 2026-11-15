/** Небольшое общее состояние интерфейса: уведомления, подтверждения, тема. */
import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export type Theme = 'auto' | 'light' | 'dark';

interface UiState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  theme: Theme;
}

const THEME_KEY = 'kb.theme';
const readTheme = (): Theme => {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
};

let state: UiState = { toasts: [], confirm: null, theme: readTheme() };
const listeners = new Set<() => void>();
const set = (patch: Partial<UiState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

export function useUi(): UiState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

let toastId = 1;

export function toast(text: string, opts: { kind?: 'info' | 'error'; action?: Toast['action'] } = {}): void {
  const t: Toast = { id: toastId++, text, kind: opts.kind ?? 'info', action: opts.action };
  set({ toasts: [...state.toasts.slice(-2), t] });
  window.setTimeout(() => dismissToast(t.id), opts.action || opts.kind === 'error' ? 6000 : 2600);
}

export const toastError = (text: string) => toast(text, { kind: 'error' });

export function dismissToast(id: number): void {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

/** Подтверждение разрушительного действия. */
export function confirmAction(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    set({
      confirm: {
        ...req,
        resolve: (ok) => {
          set({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

export function applyTheme(theme: Theme = state.theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  if (theme === 'auto') localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  set({ theme });
}
