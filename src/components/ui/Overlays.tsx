import { dismissToast, useUi } from '../../app/store';
import { Modal } from './Modal';

/** Уведомления и окно подтверждения — общие для всего приложения. */
export function Overlays() {
  const { toasts, confirm } = useUi();
  return (
    <>
      {confirm && (
        <Modal title={confirm.title} text={confirm.text} onClose={() => confirm.resolve(false)}>
          <div className="modal__actions">
            <button className="btn" onClick={() => confirm.resolve(false)}>
              Отмена
            </button>
            <button className={`btn ${confirm.danger ? 'btn--danger' : 'btn--primary'}`} data-autofocus onClick={() => confirm.resolve(true)}>
              {confirm.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'error' ? ' toast--error' : ''}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast__action"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
