/** Репозитории страниц, материалов и тегов: только SQL, без правил предметной области. */
import { norm } from '../../core/text';
import type { Concept, ConceptType, Note, Status } from '../../core/types';
import type { Ctx } from '../context';

interface ConceptRow {
  id: string;
  title: string;
  type: ConceptType;
  status: Status;
  marked: number;
  body: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

interface NoteRow {
  id: string;
  title: string;
  content: string;
  inbox: number;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const live = (includeDeleted: boolean) => (includeDeleted ? '' : 'WHERE deleted = 0');

function groupBy(rows: { k: string; v: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.k);
    if (list) list.push(r.v);
    else map.set(r.k, [r.v]);
  }
  return map;
}

const toConcept = (r: ConceptRow, tags: string[]): Concept => ({
  id: r.id,
  title: r.title,
  type: r.type,
  status: r.status,
  marked: !!r.marked,
  body: r.body,
  tags,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.deleted ? { deleted: true } : {}),
});

const toNote = (r: NoteRow, conceptIds: string[]): Note => ({
  id: r.id,
  title: r.title,
  content: r.content,
  inbox: !!r.inbox,
  conceptIds,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.deleted ? { deleted: true } : {}),
});

export const conceptsRepo = {
  get(ctx: Ctx, id: string, includeDeleted = false): Concept | undefined {
    const r = ctx.db.get<ConceptRow>(`SELECT * FROM concepts WHERE id = ? ${includeDeleted ? '' : 'AND deleted = 0'}`, [id]);
    return r && toConcept(r, this.tagsOf(ctx, id));
  },

  all(ctx: Ctx, includeDeleted = false): Concept[] {
    const tags = groupBy(
      ctx.db.all('SELECT ct.concept_id k, t.name v FROM concept_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name'),
    );
    return ctx.db
      .all<ConceptRow>(`SELECT * FROM concepts ${live(includeDeleted)} ORDER BY title_key`)
      .map((r) => toConcept(r, tags.get(r.id) ?? []));
  },

  byTitle(ctx: Ctx, title: string): { id: string; title: string } | undefined {
    return ctx.db.get('SELECT id, title FROM concepts WHERE title_key = ? AND deleted = 0', [norm(title)]);
  },

  titles(ctx: Ctx): { id: string; title: string }[] {
    return ctx.db.all('SELECT id, title FROM concepts WHERE deleted = 0');
  },

  exists(ctx: Ctx, id: string): boolean {
    return !!ctx.db.get('SELECT 1 x FROM concepts WHERE id = ? AND deleted = 0', [id]);
  },

  insert(ctx: Ctx, c: Concept): void {
    ctx.db.run(
      `INSERT INTO concepts (id, title, title_key, type, status, marked, body, created_at, updated_at, deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.title, norm(c.title), c.type, c.status, c.marked ? 1 : 0, c.body, c.createdAt, c.updatedAt, c.deleted ? 1 : 0],
    );
    this.setTags(ctx, c.id, c.tags);
  },

  update(ctx: Ctx, id: string, f: Partial<Pick<Concept, 'title' | 'type' | 'status' | 'marked' | 'body' | 'deleted'>>): void {
    const sets: string[] = ['updated_at = ?'];
    const bind: (string | number)[] = [ctx.now()];
    if (f.title !== undefined) {
      sets.push('title = ?', 'title_key = ?');
      bind.push(f.title, norm(f.title));
    }
    if (f.type !== undefined) (sets.push('type = ?'), bind.push(f.type));
    if (f.status !== undefined) (sets.push('status = ?'), bind.push(f.status));
    if (f.marked !== undefined) (sets.push('marked = ?'), bind.push(f.marked ? 1 : 0));
    if (f.body !== undefined) (sets.push('body = ?'), bind.push(f.body));
    if (f.deleted !== undefined) (sets.push('deleted = ?'), bind.push(f.deleted ? 1 : 0));
    ctx.db.run(`UPDATE concepts SET ${sets.join(', ')} WHERE id = ?`, [...bind, id]);
    ctx.mark('concept', id);
  },

  tagsOf(ctx: Ctx, id: string): string[] {
    return ctx.db
      .all<{ name: string }>('SELECT t.name FROM concept_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.concept_id = ? ORDER BY t.name', [id])
      .map((r) => r.name);
  },

  setTags(ctx: Ctx, id: string, names: string[]): void {
    ctx.db.run('DELETE FROM concept_tags WHERE concept_id = ?', [id]);
    for (const name of names) {
      const key = norm(name);
      let tag = ctx.db.get<{ id: string }>('SELECT id FROM tags WHERE name_key = ?', [key]);
      if (!tag) {
        tag = { id: ctx.uuid() };
        ctx.db.run('INSERT INTO tags (id, name, name_key) VALUES (?,?,?)', [tag.id, name, key]);
      }
      ctx.db.run('INSERT OR IGNORE INTO concept_tags (concept_id, tag_id) VALUES (?,?)', [id, tag.id]);
    }
    ctx.db.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM concept_tags)');
    ctx.mark('concept', id);
  },
};

export const notesRepo = {
  get(ctx: Ctx, id: string, includeDeleted = false): Note | undefined {
    const r = ctx.db.get<NoteRow>(`SELECT * FROM notes WHERE id = ? ${includeDeleted ? '' : 'AND deleted = 0'}`, [id]);
    return r && toNote(r, this.conceptIdsOf(ctx, id));
  },

  all(ctx: Ctx, includeDeleted = false): Note[] {
    const links = groupBy(ctx.db.all('SELECT note_id k, concept_id v FROM concept_notes'));
    return ctx.db
      .all<NoteRow>(`SELECT * FROM notes ${live(includeDeleted)} ORDER BY created_at DESC`)
      .map((r) => toNote(r, links.get(r.id) ?? []));
  },

  forConcept(ctx: Ctx, conceptId: string): Note[] {
    return ctx.db
      .all<NoteRow>(
        `SELECT n.* FROM notes n JOIN concept_notes cn ON cn.note_id = n.id
         WHERE cn.concept_id = ? AND n.deleted = 0 ORDER BY n.created_at`,
        [conceptId],
      )
      .map((r) => toNote(r, this.conceptIdsOf(ctx, r.id)));
  },

  inbox(ctx: Ctx): Note[] {
    return ctx.db.all<NoteRow>('SELECT * FROM notes WHERE inbox = 1 AND deleted = 0 ORDER BY created_at DESC').map((r) => toNote(r, []));
  },

  conceptIdsOf(ctx: Ctx, id: string): string[] {
    return ctx.db.all<{ concept_id: string }>('SELECT concept_id FROM concept_notes WHERE note_id = ?', [id]).map((r) => r.concept_id);
  },

  insert(ctx: Ctx, n: Note): void {
    ctx.db.run('INSERT INTO notes (id, title, content, inbox, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?)', [
      n.id, n.title, n.content, n.inbox ? 1 : 0, n.createdAt, n.updatedAt, n.deleted ? 1 : 0,
    ]);
    this.setConcepts(ctx, n.id, n.conceptIds);
  },

  update(ctx: Ctx, id: string, f: Partial<Pick<Note, 'title' | 'content' | 'inbox' | 'deleted'>>): void {
    const sets: string[] = ['updated_at = ?'];
    const bind: (string | number)[] = [ctx.now()];
    if (f.title !== undefined) (sets.push('title = ?'), bind.push(f.title));
    if (f.content !== undefined) (sets.push('content = ?'), bind.push(f.content));
    if (f.inbox !== undefined) (sets.push('inbox = ?'), bind.push(f.inbox ? 1 : 0));
    if (f.deleted !== undefined) (sets.push('deleted = ?'), bind.push(f.deleted ? 1 : 0));
    ctx.db.run(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, [...bind, id]);
    ctx.mark('note', id);
  },

  setConcepts(ctx: Ctx, id: string, conceptIds: string[]): void {
    ctx.db.run('DELETE FROM concept_notes WHERE note_id = ?', [id]);
    for (const c of new Set(conceptIds)) ctx.db.run('INSERT INTO concept_notes (concept_id, note_id) VALUES (?,?)', [c, id]);
    ctx.mark('note', id);
  },
};
