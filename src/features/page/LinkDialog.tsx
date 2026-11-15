import { useState } from 'react';
import { useBase } from '../../app/base';
import { toast } from '../../app/store';
import { ConceptPicker } from '../../components/ui/ConceptPicker';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/client';

/** F5: связь без ссылки в тексте. Тип выбирается ответом на вопрос, а не из списка терминов. */
export function LinkDialog({ conceptId, title, onClose }: { conceptId: string; title: string; onClose: () => void }) {
  const { types } = useBase();
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');

  const create = async (typeId: string) => {
    if (!target.trim()) {
      setError('Сначала укажите страницу');
      return;
    }
    try {
      await api.relations.create(conceptId, { title: target }, typeId);
      toast('Связь добавлена');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal title={`Связать «${title}»`} onClose={onClose}>
      <div className="field">
        <span className="field__label">С какой страницей</span>
        <ConceptPicker
          label="С какой страницей"
          value={target}
          onChange={(v) => (setTarget(v), setError(''))}
          excludeIds={[conceptId]}
          placeholder="Начните вводить название"
          autoFocus
        />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <span className="field__label">Как они связаны? Выберите, что верно</span>
        <div className="questions">
          {types.map((t) => (
            <button key={t.id} className="btn questions__btn" onClick={() => void create(t.id)}>
              <span className="questions__swatch" style={{ background: t.color }} />
              <span>{t.question}</span>
              <span className="muted">— {t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal__actions">
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </Modal>
  );
}
