/** Репозиторий прикреплённых изображений. */
import { fromBase64, toBase64 } from '../../core/crypto';
import type { Attachment, AttachmentFile } from '../../core/types';
import type { Ctx } from '../context';

interface Row {
  id: string;
  name: string;
  mime: string;
  size: number;
  data: Uint8Array;
  created_at: number;
}

const encode = (r: Row): Attachment => ({ id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at, data: toBase64(r.data) });

export const attachmentsRepo = {
  file(ctx: Ctx, id: string): AttachmentFile | undefined {
    return ctx.db.get<AttachmentFile>('SELECT id, name, mime, data FROM attachments WHERE id = ?', [id]);
  },

  /** С содержимым в base64 — для резервной копии и шифрованного хранилища. */
  encoded(ctx: Ctx, id: string): Attachment | undefined {
    const r = ctx.db.get<Row>('SELECT * FROM attachments WHERE id = ?', [id]);
    return r && encode(r);
  },

  all(ctx: Ctx): Attachment[] {
    return ctx.db.all<Row>('SELECT * FROM attachments ORDER BY created_at').map(encode);
  },

  list(ctx: Ctx): { id: string; created_at: number }[] {
    return ctx.db.all('SELECT id, created_at FROM attachments');
  },

  insert(ctx: Ctx, a: { id: string; name: string; mime: string; createdAt: number }, data: Uint8Array): void {
    ctx.db.run('INSERT INTO attachments (id, name, mime, size, data, created_at) VALUES (?,?,?,?,?,?)', [a.id, a.name, a.mime, data.length, data, a.createdAt]);
    ctx.mark('attachment', a.id);
  },

  insertEncoded(ctx: Ctx, a: Attachment): void {
    this.insert(ctx, a, fromBase64(a.data));
  },

  remove(ctx: Ctx, id: string): void {
    ctx.db.run('DELETE FROM attachments WHERE id = ?', [id]);
    ctx.mark('attachment', id);
  },
};
