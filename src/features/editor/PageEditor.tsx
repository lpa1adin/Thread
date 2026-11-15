import { Check as CheckIcon, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBase } from '../../app/base';
import { confirmAction, toast, toastError } from '../../app/store';
import { CONCEPT_TYPES, STATUSES } from '../../core/constants';
import { findMentions, linkFirstMention, norm, scanLinks } from '../../core/text';
import type { Concept, ConceptType, Status } from '../../core/types';
import { api, errorMessage } from '../../lib/client';
import { useDebouncedCallback } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { EditorLayout } from './EditorLayout';
import { MarkdownEditor } from './MarkdownEditor';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const SAVE_LABEL: Record<SaveState, string> = { saved: 'Сохранено', dirty: 'Есть несохранённые правки…', saving: 'Сохраняю…', error: 'Не сохранилось — проверьте название' };

/** Редактор страницы (F1–F3, F11). Текст сохраняется сам, пока вы пишете. */
export function PageEditor({ id }: { id: string }) {
  const base = useBase();
  const [concept, setConcept] = useState<Concept | null>(null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [body, setBody] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  /** «Пустые» ссылки, которые были в тексте до правки: страницы для них не создаются. */
  const keepEmpty = useRef<string[]>([]);
  const removed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.concepts.get(id).then(
      (c) => {
        if (cancelled) return;
        setConcept(c);
        setTitle(c.title);
        setTagsText(c.tags.join(', '));
        setBody(c.body);
        keepEmpty.current = scanLinks(c.body).map((l) => l.title).filter((t) => !base.render.titleIndex.has(norm(t)));
      },
      () => !cancelled && setMissing(true),
    );
    return () => {
      cancelled = true;
    };
    // Страница читается один раз при открытии редактора: дальше источник истины — сам редактор.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patch = async (p: Parameters<typeof api.concepts.update>[1]) => {
    setSave('saving');
    try {
      const next = await api.concepts.update(id, p);
      setConcept(next);
      setSave('saved');
      return next;
    } catch (e) {
      setSave('error');
      toastError(errorMessage(e));
      return null;
    }
  };

  const saveBody = useDebouncedCallback((text: string) => void patch({ body: text }), 600);

  // Выход из редактора любым способом: дописываем отложенное и создаём страницы по новым ссылкам.
  useEffect(() => {
    const flush = () => saveBody.flush();
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
      if (removed.current) return;
      api.concepts.finishEditing(id, keepEmpty.current).then(
        (created) => created.length && toast(created.length === 1 ? `Создана страница «${created[0]}»` : `Созданы страницы: ${created.join(', ')}`),
        () => undefined,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mentions = useMemo(() => findMentions(body, base.concepts, [id]), [body, base.concepts, id]);
  const newPages = useMemo(() => {
    const keep = new Set(keepEmpty.current.map(norm));
    return [...new Set(scanLinks(body).map((l) => l.title).filter((t) => !base.render.titleIndex.has(norm(t)) && !keep.has(norm(t))))];
  }, [body, base.render]);

  if (missing) {
    return (
      <div className="view">
        <div className="error-box" role="alert">
          <h1>Страница не найдена</h1>
          <a className="btn btn--primary" href={`#${paths.overview}`}>
            Перейти к обзору
          </a>
        </div>
      </div>
    );
  }
  if (!concept) return <div className="view" />;

  const onBody = (text: string) => {
    setBody(text);
    setSave('dirty');
    saveBody.run(text);
  };

  const commitTitle = async () => {
    if (title.trim() === concept.title) return;
    const next = await patch({ title });
    setTitle(next ? next.title : concept.title);
    if (next && next.body !== body) {
      // Переименование поправило ссылки на эту страницу в её же тексте.
      setBody(next.body);
      setEditorKey((k) => k + 1);
    }
  };

  const linkMentions = () => {
    let text = body;
    for (const m of mentions) text = linkFirstMention(text, m.title);
    onBody(text);
    setEditorKey((k) => k + 1);
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: `Удалить страницу «${concept.title}»?`,
      text: 'Материалы останутся: привязанные только к этой странице вернутся во входящие. Ссылки на неё в других текстах станут «пустыми» и будут подсвечены.',
      confirmLabel: 'Удалить страницу',
      danger: true,
    });
    if (!ok) return;
    try {
      removed.current = true;
      await api.concepts.remove(id);
      toast('Страница удалена');
      navigate(paths.overview, { replace: true });
    } catch (e) {
      removed.current = false;
      toastError(errorMessage(e));
    }
  };

  return (
    <div className="view">
      <div className="page page--wide">
        <input
          className="input editor__title"
          aria-label="Название страницы"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="editor__meta">
          <label className="editor__metaitem">
            <span className="field__label">Тип</span>
            <select className="select" value={concept.type} onChange={(e) => void patch({ type: e.target.value as ConceptType })}>
              {Object.entries(CONCEPT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="editor__metaitem">
            <span className="field__label">Статус</span>
            <select className="select" value={concept.status} onChange={(e) => void patch({ status: e.target.value as Status })}>
              {Object.entries(STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="editor__metaitem editor__metaitem--grow">
            <span className="field__label">Теги через запятую</span>
            <input
              className="input"
              value={tagsText}
              placeholder="например: сеть, безопасность"
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={() => void patch({ tags: tagsText.split(',') }).then((n) => n && setTagsText(n.tags.join(', ')))}
            />
          </label>
        </div>

        <EditorLayout
          preview={body}
          editor={
            <MarkdownEditor
              key={editorKey}
              initial={body}
              onChange={onBody}
              label="Текст страницы"
              autoFocus={!concept.body}
              placeholder={'Текст страницы в Markdown.\n\n## Заголовок\n**жирный**, `код`, - список, - [ ] пункт с отметкой\n\nСсылка на другую страницу: [[HTTP]]'}
            />
          }
        />
        <p className="editor__hint">
          Наберите <code>[[</code>, чтобы сослаться на страницу. Тип связи — через черту: <code>[[HTTP|требует знания]]</code>. Если не уверены, как связаны понятия, ставьте ссылку без типа.
        </p>

        {mentions.length > 0 && (
          <div className="callout callout--warn editor__note">
            В тексте упоминаются страницы: <b>{mentions.map((m) => m.title).join(', ')}</b>.
            <div className="callout__actions">
              <button className="btn btn--small" onClick={linkMentions}>
                Сделать ссылками
              </button>
            </div>
          </div>
        )}
        {newPages.length > 0 && (
          <div className="callout callout--accent editor__note">
            Страниц ещё нет: <b>{newPages.join(', ')}</b> — они появятся, когда вы закончите редактирование.
          </div>
        )}

        <div className="editor__footer">
          <button className="btn btn--danger" onClick={() => void remove()}>
            <Trash2 size={15} /> Удалить страницу
          </button>
          <span className={`editor__status editor__status--${save}`} role="status">
            {SAVE_LABEL[save]}
          </span>
          <button className="btn btn--primary" onClick={() => navigate(paths.page(id), { replace: true })}>
            <CheckIcon size={16} /> Готово
          </button>
        </div>
      </div>
    </div>
  );
}
