import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dataVersion } from './client';

export function useDataVersion(): number {
  return useSyncExternalStore(dataVersion.subscribe, dataVersion.get);
}

interface Query<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/**
 * Загружает данные из воркера и перечитывает их при изменении зависимостей или самих данных.
 * Пока идёт повторная загрузка, на экране остаются прежние данные — без мигания.
 */
export function useQuery<T>(load: () => Promise<T>, deps: unknown[]): Query<T> {
  const version = useDataVersion();
  const [state, setState] = useState<Query<T>>({ data: undefined, error: null, loading: true });
  const depsKey = JSON.stringify(deps);
  const lastKey = useRef(depsKey);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    let cancelled = false;
    // Другие параметры (например, другая страница) — старые данные показывать нельзя.
    if (lastKey.current !== depsKey) {
      lastKey.current = depsKey;
      setState({ data: undefined, error: null, loading: true });
    }
    loader.current().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: Error) => !cancelled && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      cancelled = true;
    };
  }, [depsKey, version]);

  return state;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (fn: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Откладывает вызов fn; flush выполняет отложенное немедленно (перед уходом со страницы). */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const timer = useRef<number | undefined>(undefined);
  const pendingArgs = useRef<A | null>(null);
  const latest = useRef(fn);
  latest.current = fn;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pendingArgs.current) {
      const args = pendingArgs.current;
      pendingArgs.current = null;
      latest.current(...args);
    }
  }, []);

  const run = useCallback(
    (...args: A) => {
      pendingArgs.current = args;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [delay, flush],
  );

  return { run, flush };
}
