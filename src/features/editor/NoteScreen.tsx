import { Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBase } from '../../app/base';
import { confirmAction, toast, toastError } from '../../app/store';
import { ConceptPicker } from '../../components/ui/ConceptPicker';
import { norm } from '../../core/text';
import { api, errorMessage } from '../../lib/client';
import { goBack, navigate, paths, useRouter } from '../../lib/router';
import { EditorLayout } from './EditorLayout';
import { MarkdownEditor } from './MarkdownEditor';

/** Материал: конспект, статья или ссылка, привязанные к одной или нескольким страницам (F7). */
export function NoteScreen({ id, pageId }: { id: string; pageId: string }) {
  const base = useBase();
  const router = useRouter();
  const isNew = id === 'new';
  const [ready, setReady] = useState(isNew);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [conceptIds, setConceptIds] = useState<string[]>(pageId ? [pageId] : []);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    api.notes.get(id).then(
      (n) => {
        if (cancelled) return;
        setTitle(n.title);
        setContent(n.content);
        setConceptIds(n.conceptIds);
        setReady(true);
      },
      () => !cancelled && setMissing(true),
    );
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const leave = (toPage?: string) => {
    if (router.canBack) goBack();
    else navigate(toPage ? paths.page(toPage) : paths.inbox, { replace: true });
  };

  const addPage = async (raw: string) => {
    if (!raw.trim()) return;
    try {
      const existing = base.render.titleIndex.get(norm(raw));
      const pid = existing ?? (await api.concepts.ensure(raw)).id;
      setConceptIds((ids) => (ids.includes(pid) ? ids : [...ids, pid]));
      setAdding('');
    } catch (e) {
      toastError(errorMessage(e));
    }
  };

  const save = async () => {
    if (!title.trim() && !content.trim()) {
      toastError('Напишите заголовок или текст материала');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.notes.save({ id: isNew ? undefined : id, title, content, conceptIds });
      toast(saved.inbox ? 'Сохранено во входящие' : 'Материал сохранён');
      leave(saved.conceptIds[0]);
    } catch (e) {
      toastError(errorMessage(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmAction({ title: 'Удалить материал?', text: 'Материал исчезнет со всех страниц, к которым привязан.', confirmLabel: 'Удалить материал', danger: true }))) return;
    try {
      await api.notes.remove(id);
      toast('Материал удалён');
      leave(conceptIds[0]);
    } catch (e) {
      toastError(errorMessage(e));
    }
  };

  if (missing) {
    return (
      <div className="view">
        <div className="error-box" role="alert">
          <h1>Материал не найден</h1>
          <a className="btn btn--primary" href={`#${paths.inbox}`}>
            Открыть входящие
          </a>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="view" />;

  return (
    <div className="view">
      <div className="page page--wide">
        <h1 className="page__title page__title--small">{isNew ? 'Новый материал' : 'Материал'}</h1>
        <p className="muted page__lead">Конспект, статья, ссылка или видео по теме. Показывается на страницах, к которым привязан.</p>
        <input
          className="input editor__title"
          aria-label="Заголовок материала"
          placeholder="Заголовок, например «Статья: как работает DNS»"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        <EditorLayout
          preview={content}
          editor={<MarkdownEditor initial={content} onChange={setContent} label="Текст материала" placeholder="Текст или ссылка" autoFocus={isNew} />}
        />
        <div className="field attach">
          <span className="field__label">Относится к страницам</span>
          <div className="attach__chips">
            {conceptIds.length === 0 && <span className="muted">Ни к чему не привязан — попадёт во входящие.</span>}
            {conceptIds.map((cid) => (
              <span key={cid} className="chip">
                {base.byId.get(cid)?.title ?? 'страница'}
                <button className="chip__remove" aria-label="Отвязать от страницы" onClick={() => setConceptIds((ids) => ids.filter((x) => x !== cid))}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="attach__add">
            <ConceptPicker label="Название страницы" value={adding} onChange={setAdding} onPick={(t) => void addPage(t)} excludeIds={conceptIds} placeholder="Название страницы" />
            <button className="btn" onClick={() => void addPage(adding)} disabled={!adding.trim()}>
              Привязать
            </button>
          </div>
        </div>
        <div className="editor__footer">
          {!isNew && (
            <button className="btn btn--danger" onClick={() => void remove()}>
              <Trash2 size={15} /> Удалить
            </button>
          )}
          <span className="editor__status" />
          <button className="btn" onClick={() => leave(conceptIds[0])}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={busy}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
