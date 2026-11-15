/** Скачивание и чтение файлов пользователя. */

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const downloadText = (filename: string, text: string, mime: string) => downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));

/** Открывает системный выбор файлов и возвращает выбранные (пустой список, если отменено). */
export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export const dateStamp = () => new Date().toISOString().slice(0, 10);

export const fileSafe = (name: string) => name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'stranica';
