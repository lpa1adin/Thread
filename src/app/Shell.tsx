import { ChevronLeft, ChevronRight, Inbox as InboxIcon, LayoutDashboard, List, Plus, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageEditor } from '../features/editor/PageEditor';
import { NoteScreen } from '../features/editor/NoteScreen';
import { Inbox } from '../features/inbox/Inbox';
import { MapScreen } from '../features/map/MapScreen';
import { CaptureDialog, NewPageDialog } from '../features/nav/dialogs';
import { Sidebar } from '../features/nav/Sidebar';
import { MarkedScreen, Overview } from '../features/overview/Overview';
import { NewFromLink, PageScreen } from '../features/page/PageScreen';
import { SearchBox, SearchScreen } from '../features/search/Search';
import { Settings } from '../features/settings/Settings';
import { goBack, goForward, navigate, paths, useRouter } from '../lib/router';
import { useBase } from './base';

type Dialog = 'page' | 'capture' | null;

/** Каркас экрана (F20): сверху — история, «Чтение / Карта» и поиск; слева — меню; в центре — содержимое. */
export function Shell() {
  const router = useRouter();
  const { inboxCount } = useBase();
  const { route } = router;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [addMenu, setAddMenu] = useState(false);
  const isMap = route.name === 'map';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') (e.preventDefault(), goBack());
      if (e.key === 'ArrowRight') (e.preventDefault(), goForward());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!addMenu) return;
    const close = () => setAddMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [addMenu]);

  const screen = (() => {
    switch (route.name) {
      case 'overview':
        return <Overview onNewPage={() => setDialog('page')} />;
      case 'inbox':
        return <Inbox onCapture={() => setDialog('capture')} />;
      case 'marked':
        return <MarkedScreen />;
      case 'pages':
        return (
          <div className="view view--pages">
            <Sidebar />
          </div>
        );
      case 'page':
        return route.edit ? <PageEditor id={route.id} /> : <PageScreen id={route.id} />;
      case 'note':
        return <NoteScreen id={route.id} pageId={route.page} />;
      case 'new':
        return <NewFromLink title={route.title} />;
      case 'map':
        return <MapScreen focus={route.focus} />;
      case 'search':
        return <SearchScreen initial={route.q} />;
      case 'settings':
        return <Settings />;
    }
  })();

  const tab = (name: string, path: string, label: string, icon: React.ReactNode, badge = 0) => (
    <a className={`tabbar__item${route.name === name ? ' is-active' : ''}`} href={`#${path}`} aria-current={route.name === name ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
      {badge > 0 && <span className="badge tabbar__badge">{badge}</span>}
    </a>
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="topbar__brand" href={`#${paths.overview}`}>
          Нить
        </a>
        <div className="topbar__history">
          <button className="btn btn--ghost btn--icon" onClick={goBack} disabled={!router.canBack} aria-label="Назад" title="Назад (Alt+←)">
            <ChevronLeft size={20} />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={goForward} disabled={!router.canForward} aria-label="Вперёд" title="Вперёд (Alt+→)">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="seg" role="group" aria-label="Режим">
          <button className={`seg__btn${isMap ? '' : ' is-active'}`} aria-pressed={!isMap} onClick={() => isMap && navigate(router.lastRead)}>
            Чтение
          </button>
          <button className={`seg__btn${isMap ? ' is-active' : ''}`} aria-pressed={isMap} onClick={() => !isMap && navigate(paths.map())}>
            Карта
          </button>
        </div>
        <SearchBox />
        <a className="btn btn--ghost btn--icon topbar__search" href={`#${paths.search('')}`} aria-label="Поиск">
          <SearchIcon size={18} />
        </a>
        <div className="topbar__actions">
          <button className="btn btn--primary" onClick={() => setDialog('page')}>
            <Plus size={16} /> Страница
          </button>
          <button className="btn" onClick={() => setDialog('capture')} title="Сохранить материал, не разбираясь в связях">
            <Plus size={16} /> Во входящие
          </button>
        </div>
        <div className="topbar__add">
          <button
            className="btn btn--primary btn--icon"
            aria-label="Добавить"
            aria-haspopup="menu"
            aria-expanded={addMenu}
            onClick={(e) => (e.stopPropagation(), setAddMenu((v) => !v))}
          >
            <Plus size={18} />
          </button>
          {addMenu && (
            <div className="menu" role="menu">
              <button role="menuitem" className="menu__item" onClick={() => setDialog('page')}>
                Новая страница
              </button>
              <button role="menuitem" className="menu__item" onClick={() => setDialog('capture')}>
                Материал во входящие
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`app__body${isMap ? ' app__body--map' : ''}`}>
        <aside className="app__nav">
          <Sidebar />
        </aside>
        {/* Новый экран — новая прокрутка; карта при смене фильтра не пересоздаётся, чтобы не терять раскрытые карточки. */}
        <main className="app__main" key={isMap ? 'map' : router.path}>
          {screen}
        </main>
      </div>

      <nav className="tabbar" aria-label="Основные разделы">
        {tab('overview', paths.overview, 'Обзор', <LayoutDashboard size={20} />)}
        {tab('pages', paths.pages, 'Страницы', <List size={20} />)}
        {tab('inbox', paths.inbox, 'Входящие', <InboxIcon size={20} />, inboxCount)}
        {tab('settings', paths.settings, 'Настройки', <SettingsIcon size={20} />)}
      </nav>

      {dialog === 'page' && <NewPageDialog onClose={() => setDialog(null)} />}
      {dialog === 'capture' && <CaptureDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
