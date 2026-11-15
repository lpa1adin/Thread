import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/client';

/** Экран блокировки: без пароля данные не расшифровываются и в память не попадают (S1–S3). */
export function LockScreen({ onUnlocked }: { onUnlocked: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return setError('Введите пароль');
    setBusy(true);
    setError('');
    try {
      await api.security.unlock(password);
      await onUnlocked();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="lock">
      <form className="lock__box" onSubmit={(e) => void submit(e)} noValidate>
        <Lock size={28} aria-hidden="true" />
        <h1 className="lock__title">Нить заблокирована</h1>
        <p className="muted">Данные зашифрованы на этом устройстве. Введите мастер-пароль, чтобы открыть их.</p>
        <label className="field lock__field">
          <span className="field__label">Мастер-пароль</span>
          <input className="input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => (setPassword(e.target.value), setError(''))} aria-invalid={!!error} />
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
          {busy ? 'Проверяю пароль…' : 'Открыть базу'}
        </button>
        <p className="field__hint">Пароль нельзя восстановить: без него данные останутся зашифрованными. Поможет только резервная копия, сделанная заранее.</p>
      </form>
    </main>
  );
}
