import { Plus } from 'lucide-react';
import { toast, toastError } from '../../app/store';
import { api, errorMessage } from '../../lib/client';
import { useQuery } from '../../lib/hooks';
import { paths } from '../../lib/router';
import { MiniGraph } from '../page/MiniGraph';
import { downloadBackup } from '../settings/backup';
import { PageCard, PageLinks } from './PageCard';

const WEEK = 7 * 24 * 3600 * 1000;
const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};

/** F13: что изучается сейчас, что отложено, что требует внимания. */
export function Overview({ onNewPage }: { onNewPage: () => void }) {
  const q = useQuery(() => api.graph.overview(), []);
  const graph = useQuery(() => api.graph.neighborhood(null), []);
  const backup = useQuery(() => api.system.backupInfo(), []);
  if (!q.data) return <div className="view" />;
  const o = q.data;

  if (o.counts.concepts === 0 && o.counts.notes === 0) {
    return (
      <div className="view">
        <div className="page">
          <h1 className="page__title">Нить</h1>
          <p className="page__lead">
            Нить — ваша личная база знаний. Знания хранятся в виде страниц. Когда в тексте одной страницы упоминается другая, сделайте её ссылкой <code>[[Название]]</code> — так страницы сами связываются в граф, а режим «Карта» покажет, что за чем учить.
          </p>
          <div className="start">
            <button className="btn btn--primary" onClick={onNewPage}>
              <Plus size={16} /> Создать первую страницу
            </button>
            <button className="btn" onClick={() => void api.system.loadDemo().then(() => toast('Демо-база загружена'), (e) => toastError(errorMessage(e)))}>
              Посмотреть на примере
            </button>
          </div>
          <p className="muted start__hint">Пример — небольшая база по веб-разработке. Её можно удалить в любой момент в разделе «Настройки».</p>
        </div>
      </div>
    );
  }

  const info = backup.data;
  const needBackup =
    info && info.lastChangeAt !== null && (info.lastBackupAt === null || (info.lastChangeAt > info.lastBackupAt && Date.now() - info.lastBackupAt > WEEK));

  return (
    <div className="view view--split">
      <div className="view__main">
        <div className="page">
          <h1 className="page__title">Обзор</h1>
          <p className="muted page__lead">
            {o.counts.concepts} {plural(o.counts.concepts, 'страница', 'страницы', 'страниц')} · {o.counts.notes}{' '}
            {plural(o.counts.notes, 'материал', 'материала', 'материалов')} · {o.counts.edges} {plural(o.counts.edges, 'связь', 'связи', 'связей')}
          </p>

          {o.counts.inbox > 0 && (
            <div className="callout callout--warn">
              Во входящих {o.counts.inbox} {plural(o.counts.inbox, 'материал ждёт', 'материала ждут', 'материалов ждут')} разбора. <a href={`#${paths.inbox}`}>Разобрать</a>
            </div>
          )}
          {needBackup && (
            <div className="callout callout--accent overview__backup">
              {info.lastBackupAt === null ? 'Резервной копии ещё нет.' : 'С последней резервной копии прошло больше недели.'} База хранится только на этом устройстве — сохраните копию в файл.
              <div className="callout__actions">
                <button className="btn btn--small" onClick={() => void downloadBackup()}>
                  Сохранить копию
                </button>
              </div>
            </div>
          )}

          <section className="sec">
            <h2 className="sec__title">Отмеченные</h2>
            {o.marked.length ? o.marked.map((p) => <PageCard key={p.id} page={p} />) : <p className="empty">Отметьте интересующие страницы кружком рядом с названием — они появятся здесь и в меню.</p>}
          </section>
          <section className="sec">
            <h2 className="sec__title">Изучаю сейчас</h2>
            {o.learning.length ? o.learning.map((p) => <PageCard key={p.id} page={p} />) : <p className="empty">Нет страниц со статусом «изучаю».</p>}
          </section>
          <section className="sec">
            <h2 className="sec__title">Отложено на потом ({o.later.length})</h2>
            {o.later.length ? o.later.map((p) => <PageCard key={p.id} page={p} />) : <p className="empty">Пусто.</p>}
          </section>
          {(o.empty.length > 0 || o.isolated.length > 0) && (
            <section className="sec">
              <h2 className="sec__title">Требуют внимания</h2>
              {o.empty.length > 0 && (
                <p className="overview__list">
                  Пустые страницы: <PageLinks pages={o.empty} />
                </p>
              )}
              {o.isolated.length > 0 && (
                <p className="overview__list">
                  Ни с чем не связаны: <PageLinks pages={o.isolated} />
                </p>
              )}
            </section>
          )}
        </div>
      </div>
      <aside className="view__side" aria-label="Граф всей базы">
        <div className="side__head">
          <h2 className="side__title">Вся база</h2>
        </div>
        {graph.data && <MiniGraph graph={graph.data} height={320} />}
        <p className="side__hint">
          Нажмите на узел, чтобы открыть страницу. Дерево «что за чем учить» — в режиме «Карта».
          {graph.data?.truncated && ' Показана часть графа: страниц слишком много для одного экрана.'}
        </p>
      </aside>
    </div>
  );
}

export function MarkedScreen() {
  const q = useQuery(() => api.graph.overview(), []);
  if (!q.data) return <div className="view" />;
  return (
    <div className="view">
      <div className="page">
        <h1 className="page__title">Отмеченные</h1>
        <p className="muted page__lead">Страницы, которые вы отметили как интересующие — кружком рядом с названием или на карте.</p>
        {q.data.marked.length ? q.data.marked.map((p) => <PageCard key={p.id} page={p} />) : <p className="empty">Пока ничего не отмечено.</p>}
      </div>
    </div>
  );
}
