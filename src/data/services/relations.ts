/** Связи без ссылки в тексте — кнопка «Связать» (F5). */
import { AppError, type RelationType } from '../../core/types';
import type { Ctx } from '../context';
import { conceptsRepo } from '../repositories/content';
import { relationsRepo } from '../repositories/graph';
import { conceptsService } from './concepts';
import { graphEdges } from './graph';
import { relationTypes } from './indexing';

export const relationsService = {
  types(ctx: Ctx): RelationType[] {
    return relationTypes(ctx);
  },

  create(ctx: Ctx, sourceId: string, target: { id?: string; title?: string }, typeId: string): { id: string; targetId: string } {
    if (!conceptsRepo.exists(ctx, sourceId)) throw new AppError('not-found', 'Страница не найдена');
    const type = relationTypes(ctx).find((t) => t.id === typeId);
    if (!type) throw new AppError('bad-type', 'Неизвестный тип связи');
    const targetId = target.id && conceptsRepo.exists(ctx, target.id) ? target.id : conceptsService.ensure(ctx, target.title ?? '').id;
    if (targetId === sourceId) throw new AppError('self-link', 'Нельзя связать страницу саму с собой');
    const same = (s: string, t: string) => (s === sourceId && t === targetId) || (!type.directed && s === targetId && t === sourceId);
    if (graphEdges(ctx).some((e) => e.typeId === typeId && same(e.source, e.target))) {
      throw new AppError('duplicate', 'Такая связь уже есть');
    }
    const now = ctx.now();
    const id = ctx.uuid();
    relationsRepo.insert(ctx, { id, sourceId, targetId, typeId, createdAt: now, updatedAt: now });
    return { id, targetId };
  },

  remove(ctx: Ctx, id: string): void {
    if (!relationsRepo.get(ctx, id)) throw new AppError('not-found', 'Связь не найдена');
    relationsRepo.softDelete(ctx, id);
  },
};
