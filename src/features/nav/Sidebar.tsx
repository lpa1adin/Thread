import { Inbox as InboxIcon, LayoutDashboard, Settings } from 'lucide-react';
import { useBase } from '../../app/base';
import { TypeDot } from '../../components/ui/TypeDot';
import { CONCEPT_TYPE_ORDER, CONCEPT_TYPES } from '../../core/constants';
import { paths, useRouter } from '../../lib/router';

/** Меню слева (F20): Обзор, Входящие, Отмеченные, страницы по типам. На смартфоне — отдельная вкладка «Страницы». */
export function Sidebar() {
  const { concepts, inboxCount } = useBase();
  const { route } = useRouter();
  const current = route.name === 'page' ? route.id : null;
  const marked = concepts.filter((c) => c.marked);
  const cls = (active: boolean) => `nav__item${active ? ' is-active' : ''}`;

  return (
    <nav className="nav" aria-label="Разделы и страницы">
      <a className={cls(route.name === 'overview')} href={`#${paths.overview}`} aria-current={route.name === 'overview' ? 'page' : undefined}>
        <LayoutDashboard size={16} /> <span className="nav__text">Обзор</span>
      </a>
      <a className={cls(route.name === 'inbox')} href={`#${paths.inbox}`} aria-current={route.name === 'inbox' ? 'page' : undefined}>
        <InboxIcon size={16} /> <span className="nav__text">Входящие</span>
        {inboxCount > 0 && (
          <span className="badge" aria-label={`материалов: ${inboxCount}`}>
            {inboxCount}
          </span>
        )}
      </a>
      <a className={cls(route.name === 'settings')} href={`#${paths.settings}`} aria-current={route.name === 'settings' ? 'page' : undefined}>
        <Settings size={16} /> <span className="nav__text">Настройки и данные</span>
      </a>

      {marked.length > 0 && (
        <>
          <h2 className="nav__group">
            <a href={`#${paths.marked}`}>Отмеченные</a>
          </h2>
          {marked.map((c) => (
            <a key={c.id} className={cls(c.id === current)} href={`#${paths.page(c.id)}`}>
              <span className="check check--sm is-on" aria-hidden="true" /> <span className="nav__text">{c.title}</span>
            </a>
          ))}
        </>
      )}

      {CONCEPT_TYPE_ORDER.map((type) => {
        const list = concepts.filter((c) => c.type === type);
        if (!list.length) return null;
        return (
          <div key={type}>
            <h2 className="nav__group">{CONCEPT_TYPES[type].plural}</h2>
            {list.map((c) => (
              <a key={c.id} className={cls(c.id === current)} href={`#${paths.page(c.id)}`} aria-current={c.id === current ? 'page' : undefined}>
                <TypeDot type={c.type} status={c.status} /> <span className="nav__text">{c.title}</span>
              </a>
            ))}
          </div>
        );
      })}
      {concepts.length === 0 && <p className="nav__empty">Страниц пока нет.</p>}
    </nav>
  );
}
