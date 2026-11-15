import { CARD, type MapModel } from './mapModel';

/** Цвета карты заданы явно, а не переменными темы: экспорт в PNG и SVG должен выглядеть так же, как на экране. */
export const MAP_COLORS = {
  bg: '#1f2633',
  card: '#46505f',
  done: '#2f5f4c',
  learning: '#a421b5',
  text: '#e8ebf0',
  sub: '#b3bcc9',
  line: '#8b95a5',
  item: '#333c49',
  mark: '#f5b400',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

interface Props {
  model: MapModel;
  zoom?: number;
  /** false — для экспорта: без ссылок и областей нажатия. */
  interactive?: boolean;
}

/** Карта изучения в SVG: карточки по уровням и прямоугольные соединители со стрелками (F15). */
export function MapSvg({ model, zoom = 1, interactive = true }: Props) {
  const { layout, cards } = model;
  const width = Math.max(320, Math.ceil(layout.width));
  const height = Math.max(200, Math.ceil(layout.height));
  const C = MAP_COLORS;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} fontFamily={FONT} role="img" aria-label="Карта изучения">
      <rect width="100%" height="100%" fill={C.bg} />
      <defs>
        <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke={C.line} strokeWidth="1.6" strokeLinecap="round" />
        </marker>
      </defs>
      {layout.edges.map((e) => (
        <path key={`${e.from}>${e.to}`} d={e.path} fill="none" stroke={C.line} strokeWidth="1.3" strokeDasharray={e.type === 'part' ? '5 4' : undefined} markerEnd="url(#map-arrow)" />
      ))}
      {cards.map(({ node: n, x, y, h, open, info }) => {
        const fill = n.status === 'learning' ? C.learning : n.status === 'done' ? C.done : C.card;
        const title = (
          <text x={x + 30} y={y + CARD.h / 2 + 4} fontSize="12.5" fontWeight="600" fill={C.text}>
            {cut((n.status === 'done' ? '✓ ' : '') + n.title, 22)}
          </text>
        );
        return (
          <g key={n.id}>
            {open && <rect x={x} y={y} width={CARD.w} height={h} rx="6" fill={C.item} stroke={C.card} />}
            <rect x={x} y={y} width={CARD.w} height={CARD.h} rx="6" fill={fill} />
            {interactive ? (
              <a href={`#/page/${n.id}`} data-card={n.id} aria-label={`Открыть страницу «${n.title}»`}>
                <rect x={x + 26} y={y} width={CARD.w - 56} height={CARD.h} fill="transparent" />
                {title}
              </a>
            ) : (
              title
            )}
            <g data-mark={interactive ? n.id : undefined} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? (n.marked ? `Убрать «${n.title}» из отмеченных` : `Отметить «${n.title}»`) : undefined} style={interactive ? { cursor: 'pointer' } : undefined}>
              <rect x={x} y={y} width="28" height={CARD.h} fill="transparent" />
              <circle cx={x + 16} cy={y + CARD.h / 2} r="7" fill={n.marked ? C.mark : 'transparent'} stroke={n.marked ? C.mark : C.text} strokeWidth="1.4" />
              {n.marked && <path d={`M${x + 12.5} ${y + CARD.h / 2} l2.5 2.6 l4.6 -5`} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            </g>
            <g data-toggle={interactive ? n.id : undefined} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? (open ? `Свернуть «${n.title}»` : `Развернуть «${n.title}»`) : undefined} style={interactive ? { cursor: 'pointer' } : undefined}>
              <rect x={x + CARD.w - 30} y={y} width="30" height={CARD.h} fill="transparent" />
              <path
                d={open ? `M${x + CARD.w - 20} ${y + 20} l5 -5 l5 5` : `M${x + CARD.w - 20} ${y + 15} l5 5 l5 -5`}
                fill="none"
                stroke={C.text}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            {open && (
              <>
                <text x={x + 10} y={y + CARD.h + 6 + 14} fontSize="11" fill={C.sub}>
                  {cut(info, 36)}
                </text>
                {n.materialTitles.length === 0 && (
                  <text x={x + 10} y={y + CARD.h + 6 + CARD.line + 14} fontSize="11" fill={C.sub} fontStyle="italic">
                    материалов нет
                  </text>
                )}
                {n.materialTitles.map((m, i) => {
                  const iy = y + CARD.h + 6 + CARD.line * (i + 1);
                  const row = (
                    <>
                      <circle cx={x + 15} cy={iy + 10} r="4" fill="none" stroke={C.sub} />
                      <text x={x + 26} y={iy + 14} fontSize="11" fill={C.sub}>
                        {cut(m.title, 29)}
                      </text>
                    </>
                  );
                  return interactive ? (
                    <a key={m.id} href={`#/note/${m.id}`} aria-label={`Открыть материал «${m.title}»`}>
                      <rect x={x + 4} y={iy} width={CARD.w - 8} height={CARD.line} fill="transparent" />
                      {row}
                    </a>
                  ) : (
                    <g key={m.id}>{row}</g>
                  );
                })}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
