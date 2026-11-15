import { useState } from 'react';
import { confirmAction, toast, toastError } from '../../app/store';
import { ConceptPicker } from '../../components/ui/ConceptPicker';
import { Markdown } from '../../components/ui/Markdown';
import type { InboxItem } from '../../core/types';
import { api, errorMessage } from '../../lib/client';
import { useQuery } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';

const fail = (e: unknown) => toastError(errorMessage(e));

function Item({ item }: { item: InboxItem }) {
  const { note, suggestions } = item;
  const [target, setTarget] = useState('');

  const attach = (to: { id?: string; title?: string }, title: string) =>
    api.notes.attach(note.id, to).then(
      (pageId) => toast(`Привязано к «${title}»`, { action: { label: 'Открыть', run: () => navigate(paths.page(pageId)) } }),
      fail,
    );

  const remove = async () => {
    if (await confirmAction({ title: 'Удалить материал?', text: `«${note.title}» будет удалён из входящих.`, confirmLabel: 'Удалить материал', danger: true })) {
      await api.notes.remove(note.id).catch(fail);
    }
  };

  return (
    <article className="inbox-item">
      <h2 className="inbox-item__title">{note.title}</h2>
      <Markdown source={note.content} onToggleTask={(line) => void api.notes.toggleTask(note.id, line).catch(fail)} />
      {suggestions.length > 0 && (
        <div className="callout callout--warn inbox-item__suggest">
          Похоже, это относится к:
          <div className="callout__actions">
            {suggestions.map((s) => (
              <button key={s.id} className="btn btn--small" onClick={() => void attach({ id: s.id }, s.title)}>
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="inbox-item__actions">
        <div className="inbox-item__picker">
          <ConceptPicker label="Привязать к странице" value={target} onChange={setTarget} onPick={(t) => void attach({ title: t }, t)} placeholder="Привязать к странице…" />
        </div>
        <button className="btn btn--small" disabled={!target.trim()} onClick={() => void attach({ title: target }, target.trim())}>
          Привязать
        </button>
        <button className="btn btn--small" onClick={() => void api.notes.toPage(note.id).then((id) => navigate(paths.page(id)), fail)}>
          Сделать отдельной страницей
        </button>
        <a className="btn btn--small" href={`#${paths.note(note.id)}`}>
          Изменить
        </a>
        <button className="btn btn--ghost btn--danger btn--small" onClick={() => void remove()}>
          Удалить
        </button>
      </div>
    </article>
  );
}

/** F12: материалы, сохранённые «на потом», и их разбор. */
export function Inbox({ onCapture }: { onCapture: () => void }) {
  const q = useQuery(() => api.notes.inbox(), []);
  if (!q.data) return <div className="view" />;
  return (
    <div className="view view--split">
      <div className="view__main">
        <div className="page">
          <h1 className="page__title">Входящие</h1>
          <p className="muted page__lead">Материалы, которые вы сохранили, не разбираясь, к чему они относятся. Когда будет время, привяжите их к страницам.</p>
          {q.data.length === 0 && (
            <p className="empty">
              Всё разобрано.{' '}
              <button className="linklike" onClick={onCapture}>
                Сохранить новый материал
              </button>
            </p>
          )}
          {q.data.map((item) => (
            <Item key={item.note.id} item={item} />
          ))}
        </div>
      </div>
      <aside className="view__side" aria-label="Как разбирать входящие">
        <div className="side__head">
          <h2 className="side__title">Как разбирать</h2>
        </div>
        <ol className="side__steps">
          <li>Прочитайте материал.</li>
          <li>Если приложение нашло знакомые понятия — нажмите на одно из них, и материал появится на этой странице в разделе «Материалы».</li>
          <li>Если это новая тема — нажмите «Сделать отдельной страницей».</li>
        </ol>
      </aside>
    </div>
  );
}
