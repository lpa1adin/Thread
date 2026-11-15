import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/session';
import { toast } from '../../app/store';
import { Modal } from '../../components/ui/Modal';
import { api, errorMessage } from '../../lib/client';

type Mode = 'enable' | 'change' | 'disable';

const COPY: Record<Mode, { title: string; text: string; submit: string }> = {
  enable: {
    title: 'Установить мастер-пароль',
    text: 'Страницы, материалы и связи будут храниться на устройстве в зашифрованном виде. Пароль нельзя восстановить — запишите его и сделайте резервную копию.',
    submit: 'Зашифровать базу',
  },
  change: { title: 'Сменить мастер-пароль', text: 'Все данные будут перешифрованы новым паролем.', submit: 'Сменить пароль' },
  disable: { title: 'Отключить мастер-пароль', text: 'Данные снова будут храниться на устройстве в открытом виде.', submit: 'Отключить пароль' },
};

function PasswordDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const session = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode !== 'disable') {
      if (next.length < 8) return setError('Пароль должен быть не короче 8 символов');
      if (next !== repeat) return setError('Пароли не совпадают');
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'enable') await api.security.enable(next);
      else if (mode === 'change') await api.security.changePassword(current, next);
      else await api.security.disable(current);
      await session.refreshSecurity();
      toast(mode === 'enable' ? 'База зашифрована' : mode === 'change' ? 'Пароль изменён' : 'Пароль отключён');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={copy.title} text={copy.text} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {mode !== 'enable' && (
          <label className="field">
            <span className="field__label">Текущий пароль</span>
            <input className="input" type="password" autoComplete="current-password" data-autofocus value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        {mode !== 'disable' && (
          <>
            <label className="field">
              <span className="field__label">Новый пароль (не короче 8 символов)</span>
              <input className="input" type="password" autoComplete="new-password" data-autofocus={mode === 'enable' || undefined} value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Новый пароль ещё раз</span>
              <input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </label>
          </>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Подождите…' : copy.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** S1–S3: необязательный мастер-пароль, шифрование и автоблокировка. */
export function SecuritySection() {
  const session = useSession();
  const [dialog, setDialog] = useState<Mode | null>(null);
  const { enabled } = session.security;

  return (
    <section className="settings__sec" aria-labelledby="set-security">
      <h2 className="settings__title" id="set-security">
        Защита паролем
      </h2>
      {enabled ? (
        <>
          <p className="settings__text">
            Мастер-пароль установлен: данные на устройстве зашифрованы (AES-256-GCM, ключ из пароля — Argon2id). После блокировки они недоступны без пароля.
          </p>
          <label className="settings__row">
            <span>Блокировать, если не пользуюсь приложением</span>
            <select className="select" value={session.autoLockMinutes} onChange={(e) => session.setAutoLockMinutes(Number(e.target.value))}>
              <option value={1}>1 минуту</option>
              <option value={5}>5 минут</option>
              <option value={10}>10 минут</option>
              <option value={30}>30 минут</option>
              <option value={0}>не блокировать</option>
            </select>
          </label>
          <div className="settings__actions">
            <button className="btn" onClick={() => void session.lock()}>
              Заблокировать сейчас
            </button>
            <button className="btn" onClick={() => setDialog('change')}>
              Сменить пароль
            </button>
            <button className="btn btn--danger" onClick={() => setDialog('disable')}>
              Отключить пароль
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="settings__text">Сейчас база хранится на устройстве без шифрования: её может прочитать любой, у кого есть доступ к этому профилю браузера. Мастер-пароль зашифрует данные.</p>
          <div className="settings__actions">
            <button className="btn" onClick={() => setDialog('enable')}>
              Установить мастер-пароль
            </button>
          </div>
        </>
      )}
      {dialog && <PasswordDialog mode={dialog} onClose={() => setDialog(null)} />}
    </section>
  );
}
