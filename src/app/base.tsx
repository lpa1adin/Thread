/** Общие данные для всех экранов: список страниц, типы связей, число входящих. */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { norm } from '../core/text';
import type { ConceptBrief, RelationType } from '../core/types';
import { api } from '../lib/client';
import { useQuery } from '../lib/hooks';
import type { RenderContext } from '../lib/markdown';

interface Base {
  concepts: ConceptBrief[];
  byId: Map<string, ConceptBrief>;
  types: RelationType[];
  typeById: Map<string, RelationType>;
  inboxCount: number;
  render: RenderContext;
}

const BaseContext = createContext<Base | null>(null);

export function BaseProvider({ children }: { children: ReactNode }) {
  const concepts = useQuery(() => api.concepts.list(), []);
  const types = useQuery(() => api.relations.types(), []);
  const inbox = useQuery(() => api.notes.inboxCount(), []);

  const value = useMemo<Base | null>(() => {
    if (!concepts.data || !types.data) return null;
    const list = [...concepts.data].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return {
      concepts: list,
      byId: new Map(list.map((c) => [c.id, c])),
      types: types.data,
      typeById: new Map(types.data.map((t) => [t.id, t])),
      inboxCount: inbox.data ?? 0,
      render: { titleIndex: new Map(list.map((c) => [norm(c.title), c.id])), types: types.data },
    };
  }, [concepts.data, types.data, inbox.data]);

  const error = concepts.error ?? types.error;
  if (error) {
    return (
      <div className="error-box" role="alert">
        <h1>База не открылась</h1>
        <p className="muted">{error.message}</p>
        <button className="btn btn--primary" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </div>
    );
  }
  if (!value) return <div className="spinner" role="status" aria-label="Загрузка базы" />;
  return <BaseContext.Provider value={value}>{children}</BaseContext.Provider>;
}

export function useBase(): Base {
  const base = useContext(BaseContext);
  if (!base) throw new Error('useBase вне BaseProvider');
  return base;
}
