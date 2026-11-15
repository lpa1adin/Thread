import type { ConceptType, RelationType, Status } from './types';

export const CONCEPT_TYPES: Record<ConceptType, { name: string; plural: string; color: string; size: number }> = {
  topic: { name: 'тема', plural: 'Темы', color: '#534AB7', size: 18 },
  project: { name: 'проект', plural: 'Проекты', color: '#BA7517', size: 15 },
  tech: { name: 'технология', plural: 'Технологии', color: '#378ADD', size: 13 },
  concept: { name: 'понятие', plural: 'Понятия', color: '#1D9E75', size: 12 },
  source: { name: 'источник', plural: 'Источники', color: '#888780', size: 11 },
};

export const CONCEPT_TYPE_ORDER: ConceptType[] = ['topic', 'project', 'tech', 'concept', 'source'];

export const STATUSES: Record<Status, string> = {
  later: 'отложено',
  learning: 'изучаю',
  done: 'изучено',
};

export const REL = { related: 'rel', requires: 'req', partOf: 'part', uses: 'uses', example: 'example', alternative: 'alt' } as const;

/** Справочник из 6 типов связей (F4). Вопросы — для выбора типа без знания терминов (F5). */
export const RELATION_TYPES: RelationType[] = [
  { id: REL.requires, name: 'требует знания', question: 'Без него нельзя понять эту страницу', directed: true, color: '#7F77DD', dash: '' },
  { id: REL.partOf, name: 'является частью', question: 'Эта страница — его часть', directed: true, color: '#BA7517', dash: '' },
  { id: REL.uses, name: 'использует', question: 'Эта страница его использует', directed: true, color: '#1D9E75', dash: '' },
  { id: REL.example, name: 'пример', question: 'Эта страница — его пример', directed: true, color: '#D4537E', dash: '' },
  { id: REL.alternative, name: 'альтернатива', question: 'Это альтернативы друг другу', directed: false, color: '#D85A30', dash: '9 3 2 3' },
  { id: REL.related, name: 'связано с', question: 'Не знаю — уточню позже', directed: false, color: '#8a8a86', dash: '4 3' },
];

export const LIMITS = {
  titleLength: 200,
  textLength: 2_000_000,
  tagLength: 40,
  tagsPerPage: 30,
  backupBytes: 400 * 1024 * 1024,
  /** Одно изображение — не больше 10 МБ. */
  imageBytes: 10 * 1024 * 1024,
  importFileBytes: 1024 * 1024,
  importFiles: 200,
  /** Сколько узлов показывает маленький граф: большие графы показываются по глубине (раздел 5 ТЗ). */
  graphNodes: 150,
};
