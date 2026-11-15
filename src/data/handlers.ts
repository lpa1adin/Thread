/**
 * Перечень операций, доступных интерфейсу. Все изменения данных проходят через этот слой сервисов —
 * сюда же в ВКР встраивается очередь синхронизации.
 */
import type { Ctx } from './context';
import { backupService } from './services/backup';
import { conceptsService } from './services/concepts';
import { graphService } from './services/graph';
import { notesService } from './services/notes';
import { relationsService } from './services/relations';
import { searchService } from './services/search';
import { suggestionsService } from './services/suggestions';

/** Привязывает методы сервиса к объекту, чтобы их можно было вызывать по имени. */
function bind<T extends object>(service: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(service)) out[k] = typeof v === 'function' ? v.bind(service) : v;
  return out as T;
}

export const handlers = {
  concepts: bind(conceptsService),
  notes: bind(notesService),
  relations: bind(relationsService),
  graph: bind(graphService),
  search: bind(searchService),
  suggestions: bind(suggestionsService),
  backup: bind({
    exportMarkdown: (ctx: Ctx) => backupService.exportMarkdown(ctx),
  }),
};

export type Handlers = typeof handlers;
