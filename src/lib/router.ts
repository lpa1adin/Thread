/** Маршруты по hash и история переходов «назад / вперёд» (F20). */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'overview' }
  | { name: 'inbox' }
  | { name: 'marked' }
  | { name: 'pages' }
  | { name: 'page'; id: string; edit: boolean }
  | { name: 'note'; id: string; page: string }
  | { name: 'new'; title: string }
  | { name: 'map'; focus: string }
  | { name: 'search'; q: string }
  | { name: 'settings' };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [a = '', b = '', c = ''] = path.split('/');
  const param = (k: string) => new URLSearchParams(query).get(k) ?? '';
  switch (a) {
    case 'inbox':
    case 'marked':
    case 'pages':
    case 'settings':
      return { name: a };
    case 'page':
      return b ? { name: 'page', id: b, edit: c === 'edit' } : { name: 'overview' };
    case 'note':
      return b ? { name: 'note', id: b, page: param('page') } : { name: 'inbox' };
    case 'new':
      return { name: 'new', title: safeDecode(b) };
    case 'map':
      return { name: 'map', focus: param('focus') };
    case 'search':
      return { name: 'search', q: param('q') };
    default:
      return { name: 'overview' };
  }
}

export const paths = {
  overview: '/',
  inbox: '/inbox',
  marked: '/marked',
  pages: '/pages',
  settings: '/settings',
  page: (id: string) => `/page/${id}`,
  edit: (id: string) => `/page/${id}/edit`,
  note: (id: string) => `/note/${id}`,
  newNote: (pageId = '') => (pageId ? `/note/new?page=${pageId}` : '/note/new'),
  map: (focus = '') => (focus ? `/map?focus=${encodeURIComponent(focus)}` : '/map'),
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,
};

interface State {
  route: Route;
  path: string;
  canBack: boolean;
  canForward: boolean;
  /** Последний экран режима «Чтение» — куда вернуться с карты. */
  lastRead: string;
}

let index = (history.state as { idx?: number } | null)?.idx ?? 0;
let max = index;
const currentPath = () => location.hash.replace(/^#/, '') || '/';
let state: State = snapshot('/');
const listeners = new Set<() => void>();

function snapshot(prevRead: string): State {
  const path = currentPath();
  const route = parseRoute(location.hash);
  return { route, path, canBack: index > 0, canForward: index < max, lastRead: route.name === 'map' ? prevRead : path };
}

function emit() {
  state = snapshot(state.lastRead);
  listeners.forEach((fn) => fn());
}

if (history.state === null) history.replaceState({ idx: index }, '');

window.addEventListener('popstate', () => {
  const idx = (history.state as { idx?: number } | null)?.idx;
  if (idx === undefined) {
    // Переход по обычной ссылке <a href="#/…">: браузер создал запись истории без нашей отметки.
    index += 1;
    max = index;
    history.replaceState({ idx: index }, '');
  } else {
    index = idx;
  }
  emit();
});

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === currentPath()) return;
  if (opts.replace) history.replaceState({ idx: index }, '', `#${path}`);
  else {
    index += 1;
    max = index;
    history.pushState({ idx: index }, '', `#${path}`);
  }
  emit();
}

export const goBack = () => state.canBack && history.back();
export const goForward = () => state.canForward && history.forward();

export function useRouter(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
