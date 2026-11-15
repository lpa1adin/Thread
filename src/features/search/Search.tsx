import { Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CONCEPT_TYPES } from '../../core/constants';
import type { SearchHit } from '../../core/types';
import { api } from '../../lib/client';
import { useDataVersion } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';

const hitPath = (h: SearchHit) => (h.kind === 'page' ? paths.page(h.id) : h.inbox ? paths.inbox : h.pageId ? paths.page(h.pageId) : paths.note(h.id));

/** Фрагмент текста с подсветкой найденных слов (границы совпадений приходят из FTS5). */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/\u0001(.*?)\u0002/);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

function useSearch(query: string) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const version = useDataVersion();
  useEffect(() => {
    if (!query.trim()) return setHits(null);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.search.query(query).then(
        (r) => !cancelled && setHits(r),
        () => !cancelled && setHits([]),
      );
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, version]);
  return hits;
}

function Hit({ hit, active, onPick }: { hit: SearchHit; active?: boolean; onPick: () => void }) {
  return (
    <li role="option" aria-selected={!!active} className={`results__item${active ? ' is-active' : ''}`} onMouseDown={(e) => (e.preventDefault(), onPick())}>
      <span className="results__title">{hit.title}</span>
      <span className="results__meta">
        {hit.kind === 'page' ? CONCEPT_TYPES[hit.type ?? 'concept'].name : hit.inbox ? 'материал · входящие' : 'материал'}
      </span>
      {hit.snippet && (
        <span className="results__snippet">
          <Snippet text={hit.snippet} />
        </span>
      )}
    </li>
  );
}

/** F14: поиск в верхней панели — результаты появляются по мере ввода. */
export function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useSearch(query);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setQuery('');
    input.current?.blur();
    navigate(hitPath(h));
  };

  return (
    <div className="search" role="search">
      <SearchIcon size={16} className="search__icon" aria-hidden="true" />
      <input
        ref={input}
        className="input search__input"
        type="search"
        placeholder="Поиск по тексту"
        aria-label="Поиск по страницам и материалам"
        role="combobox"
        aria-expanded={open && !!hits}
        aria-controls="search-results"
        autoComplete="off"
        value={query}
        onChange={(e) => (setQuery(e.target.value), setOpen(true), setActive(0))}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!hits?.length) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(hits[Math.min(active, hits.length - 1)]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && hits && (
        <ul className="results" id="search-results" role="listbox">
          {hits.length === 0 && <li className="results__empty">Ничего не найдено. Попробуйте другое слово или его начало.</li>}
          {hits.map((h, i) => (
            <Hit key={`${h.kind}:${h.id}`} hit={h} active={i === active} onPick={() => pick(h)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Поиск отдельным экраном — для смартфона. */
export function SearchScreen({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial);
  const hits = useSearch(query);
  return (
    <div className="view">
      <div className="page">
        <h1 className="page__title">Поиск</h1>
        <input
          className="input search-screen__input"
          type="search"
          autoFocus
          placeholder="Слово из текста страницы или материала"
          aria-label="Поиск по страницам и материалам"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits && hits.length === 0 && <p className="empty">Ничего не найдено. Попробуйте другое слово или его начало.</p>}
        {hits && hits.length > 0 && (
          <ul className="results results--static" role="listbox">
            {hits.map((h) => (
              <Hit key={`${h.kind}:${h.id}`} hit={h} onPick={() => navigate(hitPath(h))} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
