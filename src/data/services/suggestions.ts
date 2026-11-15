/** F11: неявные упоминания превращаются в ссылки только после подтверждения пользователем. */
import { findMentions, linkFirstMention } from '../../core/text';
import { AppError } from '../../core/types';
import type { Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { conceptsService } from './concepts';
import { notesService } from './notes';

export const suggestionsService = {
  /** Делает ссылками упоминания выбранных страниц (или всех найденных). Возвращает число новых ссылок. */
  linkMentions(ctx: Ctx, kind: 'page' | 'note', id: string, conceptIds?: string[]): number {
    const page = kind === 'page' ? conceptsRepo.get(ctx, id) : undefined;
    const note = kind === 'note' ? notesRepo.get(ctx, id) : undefined;
    if (!page && !note) throw new AppError('not-found', 'Текст не найден');
    let text = page ? page.body : note!.content;
    const only = conceptIds && new Set(conceptIds);
    const mentions = findMentions(text, conceptsRepo.titles(ctx), page ? [id] : []).filter((m) => !only || only.has(m.id));
    for (const m of mentions) text = linkFirstMention(text, m.title);
    if (!mentions.length) return 0;
    if (page) conceptsService.update(ctx, id, { body: text });
    else notesService.save(ctx, { id, title: note!.title, content: text, conceptIds: note!.conceptIds });
    return mentions.length;
  },
};
