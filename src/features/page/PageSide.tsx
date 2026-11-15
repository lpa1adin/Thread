import { Link2, X } from 'lucide-react';
import { useState } from 'react';
import { useBase } from '../../app/base';
import { toast, toastError } from '../../app/store';
import type { PageView } from '../../core/types';
import { api, errorMessage } from '../../lib/client';
import { useQuery } from '../../lib/hooks';
import { paths } from '../../lib/router';
import { LinkDialog } from './LinkDialog';
import { MiniGraph } from './MiniGraph';

/** F9, F11: панель связей — граф соседей, список связей с типом и направлением, подсказки упоминаний. */
export function PageSide({ view }: { view: PageView }) {
  const { typeById } = useBase();
  const { concept, relations, mentions } = view;
  const [depth, setDepth] = useState(1);
  const [linking, setLinking] = useState(false);
  const graph = useQuery(() => api.graph.neighborhood(concept.id, depth), [concept.id, depth]);

  const linkMentions = async () => {
    try {
      const n = await api.suggestions.linkMentions('page', concept.id);
      toast(n === 1 ? 'Упоминание стало ссылкой' : `Упоминания стали ссылками: ${n}`);
    } catch (e) {
      toastError(errorMessage(e));
    }
  };

  return (
    <>
      <div className="side__head">
        <h2 className="side__title">Связи на графе</h2>
        <div className="seg seg--small" role="group" aria-label="Глубина графа">
          {[1, 2].map((d) => (
            <button key={d} className={`seg__btn${depth === d ? ' is-active' : ''}`} aria-pressed={depth === d} onClick={() => setDepth(d)} title={d === 1 ? 'Только соседи' : 'Соседи и их соседи'}>
              {d === 1 ? 'соседи' : '+ их соседи'}
            </button>
          ))}
        </div>
      </div>
      {graph.data && <MiniGraph graph={graph.data} selectedId={concept.id} height={240} />}
      {graph.data?.truncated && <p className="side__hint">Показана часть графа: связей слишком много для одного экрана.</p>}

      <div className="side__head">
        <h2 className="side__title">Связи ({relations.length})</h2>
        <button className="btn btn--small" onClick={() => setLinking(true)}>
          <Link2 size={14} /> Связать
        </button>
      </div>
      {relations.length === 0 && <p className="side__hint">Пока ни с чем не связано.</p>}
      <ul className="rels">
        {relations.map(({ edge, other, outgoing }) => {
          const t = typeById.get(edge.typeId);
          const arrow = !t?.directed ? '↔' : outgoing ? '→' : '←';
          return (
            <li key={edge.id} className="rels__row">
              <span className="rels__type" style={{ color: t?.color }}>
                {t?.directed && !outgoing ? `${arrow} ${t.name}` : `${t?.name ?? edge.typeId} ${arrow}`}
              </span>
              <a className="rels__link" href={`#${paths.page(other.id)}`}>
                {other.title}
              </a>
              {edge.origin === 'manual' ? (
                <button
                  className="btn btn--ghost btn--icon btn--small rels__remove"
                  aria-label={`Удалить связь с «${other.title}»`}
                  title="Удалить связь"
                  onClick={() => void api.relations.remove(edge.id).catch((e) => toastError(errorMessage(e)))}
                >
                  <X size={14} />
                </button>
              ) : (
                <span className="rels__origin" title={edge.originKind === 'note' ? 'Связь задана ссылкой в материале' : 'Связь задана ссылкой в тексте'}>
                  в тексте
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {mentions.length > 0 && (
        <div className="callout callout--warn side__block">
          <b>В тексте упоминаются страницы:</b> {mentions.map((m) => m.title).join(', ')}.
          <div className="callout__actions">
            <button className="btn btn--small" onClick={() => void linkMentions()}>
              Сделать ссылками
            </button>
          </div>
        </div>
      )}
      <p className="side__hint">
        Чтобы связать страницы, напишите в тексте <code>[[Название]]</code>. Тип можно указать через черту: <code>[[HTTP|требует знания]]</code> — или выбрать позже кнопкой «Связать».
      </p>
      {linking && <LinkDialog conceptId={concept.id} title={concept.title} onClose={() => setLinking(false)} />}
    </>
  );
}
