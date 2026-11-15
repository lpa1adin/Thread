/** Общие типы предметной области. Используются и в воркере (сервисы), и в интерфейсе. */

export type ConceptType = 'topic' | 'concept' | 'tech' | 'project' | 'source';
export type Status = 'later' | 'learning' | 'done';

export interface Concept {
  id: string;
  title: string;
  type: ConceptType;
  status: Status;
  marked: boolean;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Краткие сведения о странице — для меню, карты и списков (без текста статьи). */
export interface ConceptBrief {
  id: string;
  title: string;
  type: ConceptType;
  status: Status;
  marked: boolean;
  empty: boolean;
  tasksDone: number;
  tasksAll: number;
  materials: number;
  excerpt: string;
  updatedAt: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  inbox: boolean;
  conceptIds: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  typeId: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface RelationType {
  id: string;
  name: string;
  /** Вопрос, по которому пользователь выбирает тип (F5). */
  question: string;
  directed: boolean;
  color: string;
  dash: string;
}

/** Строка индекса ссылок из текста. typeId = null — ссылка без типа. */
export interface LinkRow {
  sourceId: string;
  targetId: string;
  typeId: string | null;
  originKind: 'page' | 'note';
  originId: string;
}

/** Ребро графа: связь, заданная вручную, или ссылка из текста. */
export interface Edge {
  id: string;
  source: string;
  target: string;
  typeId: string;
  origin: 'manual' | 'text';
  originKind?: 'page' | 'note';
  originId?: string;
}

export interface Backlink {
  fromKind: 'page' | 'note';
  fromId: string;
  fromTitle: string;
  /** Куда перейти по нажатию: страница-источник или страница, к которой привязан материал. */
  pageId: string | null;
  snippet: string;
}

export interface PageRelation {
  edge: Edge;
  other: ConceptBrief;
  outgoing: boolean;
}

export interface PageView {
  concept: Concept;
  /** Уровни «является частью»: от дальнего предка к прямым родителям. */
  crumbs: ConceptBrief[][];
  prereq: { order: ConceptBrief[]; cycle: boolean };
  materials: Note[];
  backlinks: Backlink[];
  relations: PageRelation[];
  mentions: { id: string; title: string }[];
}

export interface Neighborhood {
  nodes: ConceptBrief[];
  edges: Edge[];
  /** true, если граф обрезан по числу узлов. */
  truncated: boolean;
}

export interface InboxItem {
  note: Note;
  suggestions: { id: string; title: string }[];
}

export interface Overview {
  counts: { concepts: number; notes: number; edges: number; inbox: number };
  marked: ConceptBrief[];
  learning: ConceptBrief[];
  later: ConceptBrief[];
  empty: ConceptBrief[];
  isolated: ConceptBrief[];
}

export interface BackupInfo {
  lastBackupAt: number | null;
  lastChangeAt: number | null;
}

export interface SearchHit {
  kind: 'page' | 'note';
  id: string;
  title: string;
  /** Фрагмент с найденным текстом; совпадения обёрнуты символами \u0001 … \u0002. */
  snippet: string;
  inbox: boolean;
  pageId: string | null;
  type?: ConceptType;
}

export interface MapData {
  nodes: (ConceptBrief & { materialTitles: { id: string; title: string }[] })[];
  /** from — что учить раньше (или целое), to — что позже (или часть). */
  edges: { from: string; to: string; type: 'req' | 'part' }[];
}

/** Изображение, прикреплённое к тексту: в Markdown на него ссылается ![подпись](attachment:id). */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  /** Содержимое файла в base64 — в таком виде оно попадает в резервную копию и шифрованное хранилище. */
  data: string;
}

export interface AttachmentFile {
  id: string;
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface DataSet {
  concepts: Concept[];
  notes: Note[];
  relations: Relation[];
  attachments: Attachment[];
}

export interface BackupFile extends DataSet {
  format: 'kb-backup';
  version: 1;
  exportedAt: number;
}

export interface SecurityStatus {
  enabled: boolean;
  unlocked: boolean;
}

export interface BootStatus {
  storage: 'opfs' | 'memory';
  persisted: boolean;
  security: SecurityStatus;
  empty: boolean;
}

/** Ошибка с понятным пользователю сообщением; code — для программной обработки. */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}
