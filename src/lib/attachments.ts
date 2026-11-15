/** Изображения в интерфейсе: загрузка файла в базу и получение адреса для показа. */
import { LIMITS } from '../core/constants';
import { AppError } from '../core/types';
import { api } from './client';

const urls = new Map<string, Promise<string>>();

/** Адрес blob: для показа изображения. Запоминается, чтобы одна картинка не читалась из базы много раз. */
export function attachmentUrl(id: string): Promise<string> {
  let url = urls.get(id);
  if (!url) {
    url = api.attachments.get(id).then((f) => URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.mime })));
    urls.set(id, url);
    url.catch(() => urls.delete(id));
  }
  return url;
}

/** При блокировке расшифрованные картинки убираются из памяти вместе с остальными данными. */
export function clearAttachmentUrls(): void {
  for (const url of urls.values()) void url.then(URL.revokeObjectURL, () => undefined);
  urls.clear();
}

export const isImageFile = (f: File) => /^image\/(png|jpeg|gif|webp)$/.test(f.type);

/** Сохраняет файл в базу и возвращает строку Markdown, которая показывает его в тексте. */
export async function uploadImage(file: File): Promise<string> {
  if (!isImageFile(file)) throw new AppError('image-type', `«${file.name}» — не изображение. Подходят PNG, JPEG, GIF и WebP`);
  if (file.size > LIMITS.imageBytes) throw new AppError('image-size', `«${file.name}» больше 10 МБ — уменьшите изображение и попробуйте снова`);
  const saved = await api.attachments.add({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
  // Скриншот из буфера обмена приходит с именем image.png — подпись делаем понятнее.
  const base = saved.name.replace(/\.\w+$/, '');
  const alt = (/^image$/i.test(base) ? 'Скриншот' : base).replace(/[[\]\\]/g, ' ').trim() || 'Изображение';
  return `![${alt}](attachment:${saved.id})`;
}

/** Картинки из события вставки или перетаскивания. */
export function imagesFrom(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter(isImageFile);
}
