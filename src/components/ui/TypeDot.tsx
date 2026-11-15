import type { CSSProperties } from 'react';
import { CONCEPT_TYPES, STATUSES } from '../../core/constants';
import type { ConceptType, Status } from '../../core/types';

/** Цветной кружок: цвет — тип страницы, заливка — статус изучения. */
export function TypeDot({ type, status }: { type: ConceptType; status: Status }) {
  return (
    <span
      className="dot"
      aria-hidden="true"
      data-status={status}
      style={{ '--dot': CONCEPT_TYPES[type].color } as CSSProperties}
      title={`${CONCEPT_TYPES[type].name}, ${STATUSES[status]}`}
    />
  );
}
