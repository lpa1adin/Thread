/** Изображения и скриншоты в текстах страниц и материалов. */
import { LIMITS } from '../../core/constants';
import { AppError, type AttachmentFile } from '../../core/types';
import type { Ctx } from '../context';
import { attachmentsRepo } from '../repositories/attachments';

const DAY = 24 * 3600 * 1000;
const REF = /attachment:([\w-]{1,64})/g;

/**
 * Тип определяется по содержимому файла, а не по расширению или заявленному типу (S6).
 * SVG не принимается: это документ, в который можно встроить сценарии.
 */
export function sniffImage(data: Uint8Array): string | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => data[i + k] === b);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

export function validImage(name: unknown, data: unknown): { name: string; mime: string; data: Uint8Array } {
  if (!(data instanceof Uint8Array) || data.length === 0) throw new AppError('image-empty', 'Файл пустой или не прочитался');
  if (data.length > LIMITS.imageBytes) throw new AppError('image-size', 'Изображение больше 10 МБ — уменьшите его и попробуйте снова');
  const mime = sniffImage(data);
  if (!mime) throw new AppError('image-type', 'Это не изображение. Подходят PNG, JPEG, GIF и WebP');
  const clean = String(name ?? '').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 120) || 'изображение';
  return { name: clean, mime, data };
}

export const attachmentsService = {
  add(ctx: Ctx, input: { name: string; data: Uint8Array }): { id: string; name: string } {
    const img = validImage(input?.name, input?.data);
    const id = ctx.uuid();
    attachmentsRepo.insert(ctx, { id, name: img.name, mime: img.mime, createdAt: ctx.now() }, img.data);
    return { id, name: img.name };
  },

  get(ctx: Ctx, id: string): AttachmentFile {
    const file = attachmentsRepo.file(ctx, String(id));
    if (!file) throw new AppError('not-found', 'Изображение не найдено');
    return file;
  },

  /**
   * Удаляет изображения, на которые больше нет ссылок ни в одном тексте.
   * Свежие не трогаются: только что вставленная картинка может быть ещё не сохранена вместе с текстом,
   * а удалённую из текста можно вернуть отменой правки.
   */
  sweep(ctx: Ctx, graceMs: number = DAY): number {
    const used = new Set<string>();
    const scan = (text: string) => {
      for (const m of text.matchAll(REF)) used.add(m[1]);
    };
    for (const r of ctx.db.all<{ t: string }>(`SELECT body t FROM concepts WHERE deleted = 0 AND instr(body, 'attachment:') > 0`)) scan(r.t);
    for (const r of ctx.db.all<{ t: string }>(`SELECT content t FROM notes WHERE deleted = 0 AND instr(content, 'attachment:') > 0`)) scan(r.t);
    const before = ctx.now() - Math.max(0, Number(graceMs) || 0);
    let removed = 0;
    for (const a of attachmentsRepo.list(ctx)) {
      if (!used.has(a.id) && a.created_at <= before) {
        attachmentsRepo.remove(ctx, a.id);
        removed++;
      }
    }
    return removed;
  },
};
