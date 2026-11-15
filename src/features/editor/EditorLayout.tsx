import { useState, type ReactNode } from 'react';
import { Markdown } from '../../components/ui/Markdown';
import { useMediaQuery } from '../../lib/hooks';

/** Текст и предпросмотр: рядом на широком экране, вкладками — на узком (F2). */
export function EditorLayout({ editor, preview }: { editor: ReactNode; preview: string }) {
  const wide = useMediaQuery('(min-width: 900px)');
  const [tab, setTab] = useState<'text' | 'preview'>('text');
  const showEditor = wide || tab === 'text';
  const showPreview = wide || tab === 'preview';

  return (
    <div className="editor">
      {!wide && (
        <div className="seg editor__tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'text'} className={`seg__btn${tab === 'text' ? ' is-active' : ''}`} onClick={() => setTab('text')}>
            Текст
          </button>
          <button role="tab" aria-selected={tab === 'preview'} className={`seg__btn${tab === 'preview' ? ' is-active' : ''}`} onClick={() => setTab('preview')}>
            Предпросмотр
          </button>
        </div>
      )}
      <div className="editor__cols">
        <div hidden={!showEditor}>{editor}</div>
        {showPreview && (
          <div className="editor__preview" aria-label="Предпросмотр">
            {preview.trim() ? <Markdown source={preview} /> : <p className="empty">Здесь появится текст в том виде, как его увидит читатель.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
