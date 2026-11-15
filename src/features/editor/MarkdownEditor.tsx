import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { useBase } from '../../app/base';
import { norm } from '../../core/text';

interface Props {
  /** Начальный текст. Чтобы заменить текст снаружи, смените key компонента. */
  initial: string;
  onChange: (text: string) => void;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
}

const theme = EditorView.theme({
  '&': { fontSize: '14px', backgroundColor: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-1px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { padding: '12px 14px', caretColor: 'var(--text)', minHeight: '320px' },
  '.cm-placeholder': { color: 'var(--faint)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important' },
  '.cm-tooltip': { border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', backgroundColor: 'var(--panel)', color: 'var(--text)', boxShadow: 'var(--shadow)', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-ui)', maxHeight: '240px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '6px 10px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-bg)', color: 'var(--text)' },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '10px' },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.monospace, color: 'var(--muted)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.meta], color: 'var(--faint)' },
]);

/** Редактор Markdown на CodeMirror 6 с автодополнением названий после «[[» и типов связей после «|» (F2, F3). */
export function MarkdownEditor({ initial, onChange, placeholder, label, autoFocus }: Props) {
  const base = useBase();
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  // Автодополнение читает свежий список страниц без пересоздания редактора.
  const data = useRef(base);
  data.current = base;

  useEffect(() => {
    const complete = (ctx: CompletionContext): CompletionResult | null => {
      const line = ctx.state.doc.lineAt(ctx.pos);
      const before = line.text.slice(0, ctx.pos - line.from);
      const closing = line.text.slice(ctx.pos - line.from).startsWith(']]');
      const end = closing ? '' : ']]';

      const typed = before.match(/\[\[[^[\]|]+\|([^[\]|]*)$/);
      if (typed) {
        return {
          from: ctx.pos - typed[1].length,
          options: data.current.types.map((t) => ({ label: t.name, detail: t.question, apply: t.name + end })),
          validFor: /^[^[\]|]*$/,
        };
      }
      const open = before.match(/\[\[([^[\]|]*)$/);
      if (!open) return null;
      const query = open[1];
      const options = data.current.concepts.map((c) => ({ label: c.title, apply: c.title + end, type: 'text' }));
      if (query.trim() && !data.current.render.titleIndex.has(norm(query))) {
        options.push({ label: query.trim(), apply: query.trim() + end, type: 'keyword', detail: 'новая страница' } as never);
      }
      return { from: ctx.pos - query.length, options, validFor: /^[^[\]|]*$/ };
    };

    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          autocompletion({ override: [complete], icons: false, activateOnTyping: true }),
          placeholderExt(placeholder ?? ''),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'true' }),
          EditorView.updateListener.of((u) => u.docChanged && changed.current(u.state.doc.toString())),
        ],
      }),
    });
    if (autoFocus) view.focus();
    return () => view.destroy();
    // Редактор создаётся один раз; новый текст снаружи приходит через смену key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="editor__input" />;
}
