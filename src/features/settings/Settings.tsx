import { useSession } from '../../app/session';
import { confirmAction, setTheme, toast, toastError, useUi, type Theme } from '../../app/store';
import { LIMITS } from '../../core/constants';
import { api, errorMessage } from '../../lib/client';
import { dateStamp, downloadText, pickFiles } from '../../lib/files';
import { useQuery } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { downloadBackup } from './backup';
import { SecuritySection } from './SecuritySection';

const fail = (e: unknown) => toastError(errorMessage(e));
const formatDate = (t: number | null) => (t ? new Date(t).toLocaleString('ru', { dateStyle: 'long', timeStyle: 'short' }) : 'ещё не делалась');

async function restoreFromFile() {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return;
  if (file.size > LIMITS.backupBytes) return toastError('Файл больше 400 МБ — это не резервная копия базы знаний');
  const ok = await confirmAction({
    title: 'Восстановить базу из копии?',
    text: `Текущие страницы, материалы и связи будут заменены содержимым файла «${file.name}». Если они нужны — сначала сохраните резервную копию.`,
    confirmLabel: 'Заменить данные',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await api.system.restoreBackup(await file.text());
    toast(`Восстановлено: страниц — ${res.concepts}, материалов — ${res.notes}`);
    navigate(paths.overview);
  } catch (e) {
    fail(e);
  }
}

async function importMarkdown() {
  const files = await pickFiles('.md,.markdown,.txt,text/markdown,text/plain', true);
  if (!files.length) return;
  const big = files.find((f) => f.size > LIMITS.importFileBytes);
  if (big) return toastError(`«${big.name}» больше 1 МБ — такой файл не импортируется`);
  try {
    const n = await api.notes.importMarkdown(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
    toast(`Добавлено во входящие: ${n}`, { action: { label: 'Открыть', run: () => navigate(paths.inbox) } });
  } catch (e) {
    fail(e);
  }
}

/** F16, F17, S7: данные, защита, хранилище, оформление, установка. */
export function Settings() {
  const session = useSession();
  const { theme } = useUi();
  const info = useQuery(() => api.system.backupInfo(), []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  const replaceAll = async (kind: 'demo' | 'clear') => {
    const ok = await confirmAction(
      kind === 'demo'
        ? { title: 'Загрузить демо-базу?', text: 'Текущие страницы, материалы и связи будут заменены примером по веб-разработке.', confirmLabel: 'Заменить демо-базой', danger: true }
        : { title: 'Удалить все данные?', text: 'Все страницы, материалы и связи будут удалены с этого устройства. Вернуть их можно будет только из резервной копии.', confirmLabel: 'Удалить всё', danger: true },
    );
    if (!ok) return;
    try {
      await (kind === 'demo' ? api.system.loadDemo() : api.system.clear());
      toast(kind === 'demo' ? 'Демо-база загружена' : 'Все данные удалены');
      navigate(paths.overview);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="view">
      <div className="page settings">
        <h1 className="page__title">Настройки и данные</h1>

        <section className="settings__sec" aria-labelledby="set-backup">
          <h2 className="settings__title" id="set-backup">
            Резервная копия
          </h2>
          <p className="settings__text">
            База хранится только на этом устройстве. Копия — файл JSON со всеми страницами, материалами и связями; из него базу можно восстановить здесь или на другом устройстве. Последняя копия:{' '}
            <b>{formatDate(info.data?.lastBackupAt ?? null)}</b>.
          </p>
          <div className="settings__actions">
            <button className="btn btn--primary" onClick={() => void downloadBackup()}>
              Сохранить копию в файл
            </button>
            <button className="btn" onClick={() => void restoreFromFile()}>
              Восстановить из файла…
            </button>
          </div>
        </section>

        <section className="settings__sec" aria-labelledby="set-md">
          <h2 className="settings__title" id="set-md">
            Markdown
          </h2>
          <p className="settings__text">Ваши тексты не заперты в приложении: их можно выгрузить обычным Markdown-файлом, а свои .md-файлы — добавить во входящие и разобрать по страницам.</p>
          <div className="settings__actions">
            <button className="btn" onClick={() => void api.backup.exportMarkdown().then((md) => downloadText(`nit-stranicy-${dateStamp()}.md`, md, 'text/markdown'), fail)}>
              Скачать все страницы (.md)
            </button>
            <button className="btn" onClick={() => void importMarkdown()}>
              Добавить .md-файлы во входящие…
            </button>
          </div>
        </section>

        <SecuritySection />

        <section className="settings__sec" aria-labelledby="set-storage">
          <h2 className="settings__title" id="set-storage">
            Хранилище
          </h2>
          {session.storage === 'opfs' ? (
            <p className="settings__text">
              Данные лежат в базе SQLite в закрытой файловой системе браузера (OPFS) и доступны без сети.{' '}
              {session.persisted ? 'Браузер разрешил постоянное хранение: он не удалит базу при нехватке места.' : 'Постоянное хранение не включено: при нехватке места браузер может удалить данные сайта — регулярно сохраняйте резервную копию.'}
            </p>
          ) : (
            <div className="callout callout--danger">Этот браузер не дал доступа к постоянному хранилищу (так бывает в приватном окне). Данные пропадут, когда вы закроете вкладку, — сохраните резервную копию в файл.</div>
          )}
          {session.storage === 'opfs' && !session.persisted && (
            <div className="settings__actions">
              <button className="btn" onClick={() => void session.requestPersist().then((ok) => toast(ok ? 'Постоянное хранение включено' : 'Браузер не разрешил. В Chrome помогает установка приложения'))}>
                Запросить постоянное хранение
              </button>
            </div>
          )}
        </section>

        <section className="settings__sec" aria-labelledby="set-install">
          <h2 className="settings__title" id="set-install">
            Установка
          </h2>
          {standalone ? (
            <p className="settings__text">Приложение установлено и работает без сети.</p>
          ) : (
            <>
              <p className="settings__text">
                Приложение можно установить на компьютер или смартфон: оно откроется в отдельном окне и будет работать без сети.
                {!session.canInstall && ' В Chrome и Edge — значок установки в адресной строке; в Safari на iPhone — «Поделиться» → «На экран Домой».'}
              </p>
              {session.canInstall && (
                <div className="settings__actions">
                  <button className="btn" onClick={() => void session.install()}>
                    Установить приложение
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="settings__sec" aria-labelledby="set-theme">
          <h2 className="settings__title" id="set-theme">
            Оформление
          </h2>
          <div className="seg" role="group" aria-label="Тема оформления">
            {(
              [
                ['auto', 'Как в системе'],
                ['light', 'Светлая'],
                ['dark', 'Тёмная'],
              ] as [Theme, string][]
            ).map(([value, label]) => (
              <button key={value} className={`seg__btn${theme === value ? ' is-active' : ''}`} aria-pressed={theme === value} onClick={() => setTheme(value)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings__sec" aria-labelledby="set-danger">
          <h2 className="settings__title" id="set-danger">
            Демо-данные и очистка
          </h2>
          <div className="settings__actions">
            <button className="btn btn--danger" onClick={() => void replaceAll('demo')}>
              Загрузить демо-базу
            </button>
            <button className="btn btn--danger" onClick={() => void replaceAll('clear')}>
              Удалить все данные
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
