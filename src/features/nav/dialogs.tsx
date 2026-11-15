import { useState, type FormEvent } from 'react';
import { useBase } from '../../app/base';
import { toast } from '../../app/store';
import { Modal } from '../../components/ui/Modal';
import { CONCEPT_TYPES } from '../../core/constants';
import { norm } from '../../core/text';
import type { ConceptType } from '../../core/types';
import { api, errorMessage } from '../../lib/client';
import { navigate, paths } from '../../lib/router';

/** F1: новая страница — название и тип; после создания открывается редактор. */
export function NewPageDialog({ onClose }: { onClose: () => void }) {
  const { render } = useBase();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ConceptType>('concept');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Введите название страницы');
    const existing = render.titleIndex.get(norm(title));
    if (existing) {
      toast('Такая страница уже есть — открываю её');
      onClose();
      return navigate(paths.page(existing));
    }
    try {
      const c = await api.concepts.create({ title, type });
      onClose();
      navigate(paths.edit(c.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title="Новая страница" text="Страница — это понятие, тема, технология, проект или источник со своим текстом." onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span className="field__label">Название</span>
          <input className="input" data-autofocus value={title} maxLength={200} placeholder="Например, DNS" onChange={(e) => (setTitle(e.target.value), setError(''))} aria-invalid={!!error} />
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span className="field__label">Тип</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as ConceptType)}>
            {Object.entries(CONCEPT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary">
            Создать страницу
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** F12: быстрое сохранение материала во входящие — без выбора страницы. */
export function CaptureDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim()) return setError('Напишите заголовок или текст');
    try {
      await api.notes.save({ title, content });
      toast('Сохранено во входящие', { action: { label: 'Открыть', run: () => navigate(paths.inbox) } });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title="Сохранить во входящие" text="Сохраните сейчас — разберётесь, к чему это относится, позже." onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span className="field__label">Заголовок</span>
          <input className="input" data-autofocus value={title} maxLength={200} placeholder="Например, «Статья про WebSocket»" onChange={(e) => (setTitle(e.target.value), setError(''))} />
        </label>
        <label className="field">
          <span className="field__label">Текст или ссылка</span>
          <textarea className="textarea" rows={7} value={content} onChange={(e) => (setContent(e.target.value), setError(''))} />
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary">
            Сохранить во входящие
          </button>
        </div>
      </form>
    </Modal>
  );
}
