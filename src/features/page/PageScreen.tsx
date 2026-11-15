import { Download, Map as MapIcon, Pencil, Plus } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import { toast, toastError } from '../../app/store';
import { Check } from '../../components/ui/Check';
import { Markdown } from '../../components/ui/Markdown';
import { CONCEPT_TYPES, STATUSES } from '../../core/constants';
import type { Status } from '../../core/types';
import { api, errorMessage } from '../../lib/client';
import { downloadText, fileSafe } from '../../lib/files';
import { useQuery } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { PageSide } from './PageSide';

const fail = (e: unknown) => toastError(errorMessage(e));

/** Страница в режиме чтения: статья, материалы, упоминания (F7, F8, F10, F19). */
export function PageScreen({ id }: { id: string }) {
  const q = useQuery(() => api.graph.page(id), [id]);

  if (q.error) {
    return (
      <div className="view">
        <div className="error-box" role="alert">
          <h1>Страница не найдена</h1>
          <p className="muted">{q.error.message}</p>
          <a className="btn btn--primary" href={`#${paths.overview}`}>
            Перейти к обзору
          </a>
        </div>
      </div>
    );
  }
  if (!q.data) return <div className="view" />;

  const view = q.data;
  const { concept: c, crumbs, prereq, materials, backlinks } = view;
  const type = CONCEPT_TYPES[c.type];

  const downloadMd = () => {
    const mats = materials.map((m) => `\n\n## Материал: ${m.title}\n\n${m.content.trim()}`).join('');
    downloadText(`${fileSafe(c.title)}.md`, `# ${c.title}\n\n${c.body.trim()}${mats}\n`, 'text/markdown');
  };

  return (
    <div className="view view--split">
      <article className="view__main">
        <div className="page">
          {crumbs.length > 0 && (
            <nav className="crumbs" aria-label="Является частью">
              {crumbs.map((level, i) => (
                <Fragment key={i}>
                  {level.map((p, j) => (
                    <Fragment key={p.id}>
                      {j > 0 && ', '}
                      <a href={`#${paths.page(p.id)}`}>{p.title}</a>
                    </Fragment>
                  ))}
                  <span aria-hidden="true"> › </span>
                </Fragment>
              ))}
            </nav>
          )}
          <header className="page__head">
            <Check
              size="lg"
              on={c.marked}
              label={c.marked ? 'Убрать из отмеченных' : 'Отметить как интересующее'}
              onChange={(marked) =>
                void api.concepts.update(c.id, { marked }).then(() => toast(marked ? 'Добавлено в отмеченные' : 'Убрано из отмеченных'), fail)
              }
            />
            <h1 className="page__title">{c.title}</h1>
          </header>
          <div className="page__meta">
            <span className="page__type" style={{ color: type.color }}>
              ● {type.name}
            </span>
            <select
              className="select select--small"
              aria-label="Статус изучения"
              value={c.status}
              onChange={(e) => void api.concepts.update(c.id, { status: e.target.value as Status }).catch(fail)}
            >
              {Object.entries(STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {c.tags.map((t) => (
              <span key={t} className="chip">
                #{t}
              </span>
            ))}
            <span className="page__actions">
              <button className="btn btn--ghost btn--icon btn--small" onClick={downloadMd} title="Скачать страницу в Markdown" aria-label="Скачать страницу в Markdown">
                <Download size={15} />
              </button>
              <a className="btn btn--ghost btn--small" href={`#${paths.map(c.id)}`} title="Показать ветку этой страницы на карте изучения">
                <MapIcon size={15} /> На карте
              </a>
              <a className="btn btn--small" href={`#${paths.edit(c.id)}`}>
                <Pencil size={14} /> Редактировать
              </a>
            </span>
          </div>

          {prereq.order.length > 0 && (
            <div className="callout callout--accent prereq">
              Перед этим стоит изучить:{' '}
              {prereq.order.map((p) => (
                <Fragment key={p.id}>
                  <a href={`#${paths.page(p.id)}`} className={p.status === 'done' ? 'is-done' : ''} title={STATUSES[p.status]}>
                    {p.title}
                  </a>
                  {' → '}
                </Fragment>
              ))}
              <b>{c.title}</b>
              {prereq.cycle && <span className="prereq__cycle"> В связях «требует знания» есть цикл — проверьте их.</span>}
            </div>
          )}

          {c.body.trim() ? (
            <Markdown source={c.body} className="md--article" onToggleTask={(line) => void api.concepts.toggleTask(c.id, line).catch(fail)} />
          ) : (
            <p className="empty">
              Страница пока пустая. {materials.length > 0 && 'Ниже есть материалы — из них можно собрать текст. '}
              <a href={`#${paths.edit(c.id)}`}>Написать текст</a>
            </p>
          )}

          <section className="sec" aria-labelledby="sec-materials">
            <div className="sec__head">
              <h2 className="sec__title" id="sec-materials">
                Материалы ({materials.length})
              </h2>
              <a className="btn btn--small" href={`#${paths.newNote(c.id)}`}>
                <Plus size={14} /> Добавить материал
              </a>
            </div>
            {materials.length === 0 && <p className="empty">Конспекты, статьи и ссылки по этой теме.</p>}
            {materials.map((m) => (
              <details key={m.id} className="mat" open>
                <summary className="mat__head">
                  <span className="mat__title">{m.title}</span>
                  <a className="btn btn--ghost btn--small" href={`#${paths.note(m.id)}`}>
                    Изменить
                  </a>
                </summary>
                <div className="mat__body">
                  <Markdown source={m.content} onToggleTask={(line) => void api.notes.toggleTask(m.id, line).catch(fail)} />
                </div>
              </details>
            ))}
          </section>

          {backlinks.length > 0 && (
            <section className="sec" aria-labelledby="sec-back">
              <h2 className="sec__title" id="sec-back">
                Упоминается на других страницах ({backlinks.length})
              </h2>
              {backlinks.map((b) => (
                <div key={`${b.fromKind}:${b.fromId}`} className="back">
                  <a className="back__from" href={`#${b.fromKind === 'page' ? paths.page(b.fromId) : b.pageId ? paths.page(b.pageId) : paths.inbox}`}>
                    {b.fromKind === 'note' ? `материал «${b.fromTitle}»` : b.fromTitle}
                  </a>
                  <Markdown source={b.snippet} />
                </div>
              ))}
            </section>
          )}
        </div>
      </article>
      <aside className="view__side" aria-label="Связи страницы">
        <PageSide view={view} />
      </aside>
    </div>
  );
}

/** Переход по «пустой» ссылке: страница создаётся и открывается (F3). */
export function NewFromLink({ title }: { title: string }) {
  const q = useQuery(() => api.concepts.ensure(title), [title]);
  const createdId = q.data?.id;
  useEffect(() => {
    if (createdId) navigate(paths.page(createdId), { replace: true });
  }, [createdId]);
  return (
    <div className="view">
      {q.error && (
        <div className="error-box" role="alert">
          <h1>Не удалось создать страницу</h1>
          <p className="muted">{q.error.message}</p>
        </div>
      )}
    </div>
  );
}
