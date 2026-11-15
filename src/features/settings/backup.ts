import { toast, toastError } from '../../app/store';
import { api, errorMessage } from '../../lib/client';
import { dateStamp, downloadText } from '../../lib/files';

/** F16: скачать резервную копию базы файлом JSON. */
export async function downloadBackup(): Promise<void> {
  try {
    downloadText(`nit-kopiya-${dateStamp()}.json`, await api.system.exportBackup(), 'application/json');
    toast('Резервная копия сохранена в файл');
  } catch (e) {
    toastError(errorMessage(e));
  }
}
