import type { Core } from 'cytoscape';
import { useEffect, useRef } from 'react';
import { useBase } from '../../app/base';
import { useUi } from '../../app/store';
import { CONCEPT_TYPES } from '../../core/constants';
import type { Neighborhood } from '../../core/types';
import { useMediaQuery } from '../../lib/hooks';
import { navigate, paths } from '../../lib/router';

interface Props {
  graph: Neighborhood;
  selectedId?: string;
  height: number;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Маленький граф соседей (F9) на Cytoscape.js. Нажатие на узел открывает страницу. */
export function MiniGraph({ graph, selectedId, height }: Props) {
  const { typeById } = useBase();
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useUi();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  useEffect(() => {
    let cy: Core | undefined;
    let cancelled = false;
    void import('cytoscape').then(({ default: cytoscape }) => {
      if (cancelled || !host.current) return;
      const text = cssVar('--text');
      const panel = cssVar('--panel');
      const bg = cssVar('--sunken');
      cy = cytoscape({
        container: host.current,
        elements: [
          ...graph.nodes.map((n) => {
            const t = CONCEPT_TYPES[n.type];
            return {
              data: {
                id: n.id,
                label: n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title,
                color: t.color,
                fill: n.status === 'done' ? t.color : panel,
                opacity: n.status === 'learning' ? 0.45 : 1,
                size: (n.id === selectedId ? 1.25 : 1) * t.size * 1.5,
                border: n.id === selectedId ? 4 : 2,
                learning: n.status === 'learning' ? 1 : 0,
              },
            };
          }),
          ...graph.edges.map((e) => {
            const t = typeById.get(e.typeId);
            return {
              data: {
                id: e.id,
                source: e.source,
                target: e.target,
                color: t?.color ?? '#8a8a86',
                arrow: t?.directed ? 'triangle' : 'none',
                line: t?.dash ? 'dashed' : 'solid',
              },
            };
          }),
        ],
        style: [
          {
            selector: 'node',
            style: {
              width: 'data(size)',
              height: 'data(size)',
              'background-color': 'data(fill)',
              'border-width': 'data(border)',
              'border-color': 'data(color)',
              label: 'data(label)',
              color: text,
              'font-size': 11,
              'font-family': 'Onest Variable, system-ui, sans-serif',
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'text-outline-color': bg,
              'text-outline-width': 2,
            },
          },
          { selector: 'node[learning = 1]', style: { 'background-color': 'data(color)', 'background-opacity': 0.45 } },
          {
            selector: 'edge',
            style: {
              width: 1.6,
              'line-color': 'data(color)',
              'line-style': 'data(line)' as never,
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'data(arrow)' as never,
              'arrow-scale': 0.9,
              'curve-style': 'bezier',
            },
          },
        ],
        layout:
          selectedId && graph.nodes.length <= 14
            ? { name: 'concentric', concentric: (n: { id(): string }) => (n.id() === selectedId ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 34, padding: 22 }
            : { name: 'cose', animate: false, padding: 22, nodeRepulsion: () => 9000, idealEdgeLength: () => 70 },
        minZoom: 0.3,
        maxZoom: 2.5,
      });
      cy.on('tap', 'node', (ev) => {
        const id = ev.target.id() as string;
        if (id !== selectedId) navigate(paths.page(id));
      });
      cy.on('mouseover', 'node', () => host.current && (host.current.style.cursor = 'pointer'));
      cy.on('mouseout', 'node', () => host.current && (host.current.style.cursor = 'grab'));
    });
    return () => {
      cancelled = true;
      cy?.destroy();
    };
  }, [graph, selectedId, typeById, theme, systemDark]);

  return <div ref={host} className="minigraph" style={{ height }} role="img" aria-label="Граф связей: нажмите на узел, чтобы открыть страницу" />;
}
