import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast, toastError } from '../../app/store';
import { Modal } from '../../components/ui/Modal';
import { dateStamp, downloadBlob } from '../../lib/files';
import { MapSvg } from './MapSvg';
import type { MapModel } from './mapModel';

const MAX_SIDE = 8000;

/** Рисует SVG на Canvas и возвращает PNG. Масштаб 2× для чёткости в отчётах, но не больше предела холста. */
async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg'));
      img.src = url;
    });
    const k = Math.min(2, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(k, k);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** F18: экспорт карты в текущем виде — с фильтром и раскрытыми карточками; предпросмотр, PNG, SVG, буфер обмена. */
export function ExportDialog({ model, onClose }: { model: MapModel; onClose: () => void }) {
  const [svg] = useState(() => `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(<MapSvg model={model} interactive={false} />)}`);
  const [png, setPng] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [failed, setFailed] = useState(false);
  const name = `nit-karta-${dateStamp()}`;

  useEffect(() => {
    let url = '';
    let cancelled = false;
    svgToPng(svg).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPng(blob);
        setPreview(url);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [svg]);

  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png! })]);
      toast('Картинка скопирована');
    } catch {
      toastError('Браузер не разрешил копирование — скачайте PNG');
    }
  };

  return (
    <Modal title="Экспорт карты" text="Картинка карты в текущем виде: с тем же фильтром и развёрнутыми карточками." wide onClose={onClose}>
      <div className="export__preview">
        {preview && <img src={preview} alt="Предпросмотр карты изучения" />}
        {!preview && !failed && <div className="spinner" role="status" aria-label="Готовлю картинку" />}
        {failed && <p className="export__failed">Не получилось подготовить PNG в этом браузере. Скачайте SVG — он открывается в любом браузере и редакторе.</p>}
      </div>
      <p className="field__hint">PNG — для отчёта и презентации, SVG — векторный, не теряет качество при увеличении.</p>
      <div className="modal__actions">
        <button className="btn btn--ghost" disabled={!png} onClick={() => void copy()}>
          Скопировать картинку
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Закрыть
        </button>
        <button className="btn" onClick={() => downloadBlob(`${name}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))}>
          Скачать SVG
        </button>
        <button className="btn btn--primary" disabled={!png} data-autofocus onClick={() => png && downloadBlob(`${name}.png`, png)}>
          Скачать PNG
        </button>
      </div>
    </Modal>
  );
}
