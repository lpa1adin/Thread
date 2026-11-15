import { CONCEPT_TYPES } from '../../core/constants';
import type { ConceptBrief } from '../../core/types';
import { paths } from '../../lib/router';

export function PageCard({ page }: { page: ConceptBrief }) {
  const type = CONCEPT_TYPES[page.type];
  return (
    <a className="card" href={`#${paths.page(page.id)}`}>
      <span className="card__type" style={{ color: type.color }}>
        {type.name}
        {page.tasksAll > 0 && <span className="muted"> · пунктов {page.tasksDone}/{page.tasksAll}</span>}
      </span>
      <b className="card__title">{page.title}</b>
      {page.excerpt && <span className="card__text">{page.excerpt}</span>}
    </a>
  );
}

export function PageLinks({ pages }: { pages: ConceptBrief[] }) {
  return (
    <>
      {pages.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <a href={`#${paths.page(p.id)}`}>{p.title}</a>
        </span>
      ))}
    </>
  );
}
