import { Image as ImageIcon, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { toastError } from '../../app/store';
import { api, errorMessage } from '../../lib/client';
import { useQuery } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';
import { PageLinks } from '../overview/PageCard';
import { ExportDialog } from './ExportDialog';
import { MAP_COLORS, MapSvg } from './MapSvg';
import { buildMapModel, MARKED_FILTER } from './mapModel';

const clampZoom = (z: number) => Math.round(Math.max(0.4, Math.min(2, z)) * 100) / 100;

/** Режим «Карта»: дерево изучения с фильтром, масштабом, перетаскиванием и экспортом (F15, F18). */
export function MapScreen({ focus }: { focus: string }) {
  const q = useQuery(() => api.graph.map(), []);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const model = useMemo(() => (q.data ? buildMapModel(q.data, focus, open) : null), [q.data, focus, open]);

  if (!model || !q.data) return <div className="view" />;

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Нажатия по карте: отметка, раскрытие карточки. Переходы по ссылкам браузер делает сам. */
  const act = (target: EventTarget): boolean => {
    const el = target as Element;
    const mark = el.closest('[data-mark]')?.getAttribute('data-mark');
    if (mark) {
      const node = q.data!.nodes.find((n) => n.id === mark);
      void api.concepts.update(mark, { marked: !node?.marked }).catch((e) => toastError(errorMessage(e)));
      return true;
    }
    const toggle = el.closest('[data-toggle]')?.getAttribute('data-toggle');
    if (toggle) {
      toggleOpen(toggle);
      return true;
    }
    return false;
  };

  const onClick = (e: MouseEvent) => {
    if (drag.current?.moved) {
      // Это было перетаскивание карты, а не нажатие на карточку.
      e.preventDefault();
      return;
    }
    if (act(e.target)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && act(e.target) && e.preventDefault();

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const s = scroller.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.buttons !== 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      scroller.current!.scrollLeft = d.left - dx;
      scroller.current!.scrollTop = d.top - dy;
    }
  };

  const empty = model.cards.length === 0;

  return (
    <div className="map">
      <div className="map__toolbar">
        <label className="map__filter">
          <span className="muted">Показать:</span>
          <select className="select select--small" value={focus} onChange={(e) => navigate(paths.map(e.target.value), { replace: true })}>
            <option value="">всю карту</option>
            <option value={MARKED_FILTER}>отмеченные и что нужно до них</option>
            <optgroup label="Ветка страницы">
              {model.onMap.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button className="btn btn--small" onClick={() => setOpen(new Set(model.cards.map((c) => c.node.id)))} disabled={empty}>
          Развернуть всё
        </button>
        <button className="btn btn--small" onClick={() => setOpen(new Set())} disabled={open.size === 0}>
          Свернуть всё
        </button>
        <span className="map__spacer" />
        <div className="map__zoom" role="group" aria-label="Масштаб">
          <button className="btn btn--small btn--icon" onClick={() => setZoom((z) => clampZoom(z - 0.15))} aria-label="Уменьшить" disabled={zoom <= 0.4}>
            <Minus size={14} />
          </button>
          <button className="btn btn--ghost btn--small map__zoomvalue" onClick={() => setZoom(1)} title="Вернуть масштаб 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn--small btn--icon" onClick={() => setZoom((z) => clampZoom(z + 0.15))} aria-label="Увеличить" disabled={zoom >= 2}>
            <Plus size={14} />
          </button>
        </div>
        <button className="btn btn--small btn--primary" onClick={() => setExporting(true)} disabled={empty}>
          <ImageIcon size={14} /> Экспорт картинкой
        </button>
      </div>

      <div
        ref={scroller}
        className="map__canvas"
        style={{ background: MAP_COLORS.bg }}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        }}
      >
        {empty ? (
          <p className="map__empty">
            {focus === MARKED_FILTER
              ? 'Отмеченных страниц пока нет. Отметьте страницу кружком рядом с названием.'
              : 'На карте пока ничего нет. Карта строится по связям «требует знания» и «является частью» — добавьте их ссылкой [[Название|требует знания]] или кнопкой «Связать».'}
          </p>
        ) : (
          <MapSvg model={model} zoom={zoom} />
        )}
      </div>

      <div className="map__legend">
        <span className="map__key">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="1" y1="4" x2="25" y2="4" stroke={MAP_COLORS.line} strokeWidth="1.5" />
          </svg>
          требует знания (сначала верхнее)
        </span>
        <span className="map__key">
          <svg width="26" height="8" aria-hidden="true">
            <line x1="1" y1="4" x2="25" y2="4" stroke={MAP_COLORS.line} strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
          тема → её части
        </span>
        {(
          [
            ['learning', 'изучаю'],
            ['done', 'изучено'],
            ['card', 'отложено'],
          ] as const
        ).map(([k, label]) => (
          <span key={k} className="map__key">
            <span className="map__swatch" style={{ background: MAP_COLORS[k] }} />
            {label}
          </span>
        ))}
        {model.layout.removedEdges > 0 && <span className="map__warn">В связях есть цикл — на карте он разорван ({model.layout.removedEdges}).</span>}
        {model.unplaced.length > 0 && (
          <span className="map__unplaced">
            Не на карте (нет связей «требует знания» и «является частью»): <PageLinks pages={model.unplaced} />
          </span>
        )}
      </div>
      {exporting && <ExportDialog model={model} onClose={() => setExporting(false)} />}
    </div>
  );
}
