import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowUpRight, Download, Eraser, Highlighter, Minus, MousePointer2, PenLine,
  Redo2, RotateCcw, Square, Type, Undo2, ZoomIn, ZoomOut
} from 'lucide-react';
import { loadLocal, saveLocal } from '../lib/storage';

GlobalWorkerOptions.workerSrc = pdfWorker;

type Tool = 'pan' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'text' | 'erase';
type Point = { x: number; y: number };
type Annotation = {
  id: string;
  type: Exclude<Tool, 'pan' | 'erase'>;
  points: Point[];
  color: string;
  width: number;
  alpha: number;
  text?: string;
};

export interface ChartSource {
  id: string;
  title: string;
  url: string;
  kind: 'image' | 'pdf';
  navigraph?: boolean;
}

interface Props {
  source: ChartSource | null;
  watermark?: string;
}

const COLORS = ['#ff4d4f', '#ffd43b', '#33d6ff', '#ffffff', '#7dff8a'];

function annotationKey(source: ChartSource, page: number) {
  return `aeroslate.annotations.${source.id}.${page}`;
}

function drawArrow(ctx: CanvasRenderingContext2D, a: Point, b: Point, size: number) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(angle - Math.PI / 6), b.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(angle + Math.PI / 6), b.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function paintAnnotations(canvas: HTMLCanvasElement, annotations: Annotation[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const item of annotations) {
    if (!item.points.length) continue;
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.globalAlpha = item.alpha;
    if (item.type === 'pen' || item.type === 'highlighter') {
      ctx.beginPath();
      item.points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.stroke();
    } else if (item.type === 'line' && item.points[1]) {
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      ctx.lineTo(item.points[1].x, item.points[1].y);
      ctx.stroke();
    } else if (item.type === 'arrow' && item.points[1]) {
      drawArrow(ctx, item.points[0], item.points[1], Math.max(12, item.width * 4));
    } else if (item.type === 'rect' && item.points[1]) {
      const [a, b] = item.points;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (item.type === 'text') {
      ctx.globalAlpha = 1;
      ctx.font = `700 ${Math.max(18, item.width * 7)}px system-ui, sans-serif`;
      ctx.fillText(item.text || '', item.points[0].x, item.points[0].y);
    }
    ctx.restore();
  }
}

function hitAnnotation(item: Annotation, point: Point): boolean {
  const xs = item.points.map(p => p.x);
  const ys = item.points.map(p => p.y);
  const pad = Math.max(18, item.width * 2);
  return point.x >= Math.min(...xs) - pad && point.x <= Math.max(...xs) + pad &&
    point.y >= Math.min(...ys) - pad && point.y <= Math.max(...ys) + pad;
}

export function ChartWorkspace({ source, watermark }: Props) {
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<Tool>('pan');
  const [color, setColor] = useState(COLORS[0]);
  const [zoom, setZoom] = useState(0.8);
  const [night, setNight] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [status, setStatus] = useState('Select a chart');
  const drawingBase = useRef<Annotation[] | null>(null);
  const draftId = useRef<string | null>(null);

  const persist = useCallback((items: Annotation[]) => {
    if (source) saveLocal(annotationKey(source, page), items);
  }, [source, page]);

  const commit = useCallback((next: Annotation[]) => {
    setUndoStack(stack => [...stack.slice(-49), annotations]);
    setRedoStack([]);
    setAnnotations(next);
    persist(next);
  }, [annotations, persist]);

  useEffect(() => {
    setPdf(null);
    setPage(1);
    setPageCount(1);
    setUndoStack([]);
    setRedoStack([]);
    if (!source) {
      setStatus('Select a chart');
      return;
    }
    let cancelled = false;
    const load = async () => {
      setStatus('Loading chart…');
      try {
        if (source.kind === 'pdf') {
          const doc = await getDocument({ url: source.url, disableAutoFetch: false }).promise;
          if (cancelled) return;
          setPdf(doc);
          setPageCount(doc.numPages);
        } else {
          const image = new Image();
          image.decoding = 'async';
          image.src = source.url;
          await image.decode();
          if (cancelled || !baseCanvas.current || !overlayCanvas.current) return;
          const scale = Math.min(1, 1800 / image.naturalWidth);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          baseCanvas.current.width = width;
          baseCanvas.current.height = height;
          overlayCanvas.current.width = width;
          overlayCanvas.current.height = height;
          baseCanvas.current.getContext('2d')?.drawImage(image, 0, 0, width, height);
          setStatus('Ready');
        }
      } catch (error) {
        console.error(error);
        setStatus('Unable to load chart');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => {
    if (!pdf || !baseCanvas.current || !overlayCanvas.current) return;
    let cancelled = false;
    const render = async () => {
      setStatus(`Rendering page ${page}…`);
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1.6 });
      if (cancelled || !baseCanvas.current || !overlayCanvas.current) return;
      baseCanvas.current.width = viewport.width;
      baseCanvas.current.height = viewport.height;
      overlayCanvas.current.width = viewport.width;
      overlayCanvas.current.height = viewport.height;
      const ctx = baseCanvas.current.getContext('2d');
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) setStatus('Ready');
    };
    void render();
    return () => { cancelled = true; };
  }, [pdf, page]);

  useEffect(() => {
    if (!source) {
      setAnnotations([]);
      return;
    }
    const saved = loadLocal<Annotation[]>(annotationKey(source, page), []);
    setAnnotations(saved);
    setUndoStack([]);
    setRedoStack([]);
  }, [source, page]);

  useEffect(() => {
    if (overlayCanvas.current) paintAnnotations(overlayCanvas.current, annotations);
  }, [annotations, status]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = overlayCanvas.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source || tool === 'pan') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    if (tool === 'erase') {
      commit(annotations.filter(item => !hitAnnotation(item, point)));
      return;
    }
    if (tool === 'text') {
      const text = window.prompt('Chart note');
      if (!text) return;
      commit([...annotations, { id: crypto.randomUUID(), type: 'text', points: [point], color, width: 4, alpha: 1, text }]);
      return;
    }
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: tool,
      points: [point, ...(tool === 'pen' || tool === 'highlighter' ? [] : [point])],
      color,
      width: tool === 'highlighter' ? 22 : tool === 'pen' ? 4 : 5,
      alpha: tool === 'highlighter' ? 0.35 : 1
    };
    drawingBase.current = annotations;
    draftId.current = annotation.id;
    setAnnotations([...annotations, annotation]);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingBase.current || !draftId.current) return;
    const point = canvasPoint(event);
    setAnnotations(current => current.map(item => {
      if (item.id !== draftId.current) return item;
      if (item.type === 'pen' || item.type === 'highlighter') return { ...item, points: [...item.points, point] };
      return { ...item, points: [item.points[0], point] };
    }));
  };

  const pointerUp = () => {
    if (!drawingBase.current) return;
    const base = drawingBase.current;
    setUndoStack(stack => [...stack.slice(-49), base]);
    setRedoStack([]);
    persist(annotations);
    drawingBase.current = null;
    draftId.current = null;
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack(stack => [...stack, annotations]);
    setUndoStack(stack => stack.slice(0, -1));
    setAnnotations(previous);
    persist(previous);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack(stack => [...stack, annotations]);
    setRedoStack(stack => stack.slice(0, -1));
    setAnnotations(next);
    persist(next);
  };

  const clear = () => commit([]);

  const exportChart = () => {
    if (!baseCanvas.current || !overlayCanvas.current || !source) return;
    const output = document.createElement('canvas');
    output.width = baseCanvas.current.width;
    output.height = baseCanvas.current.height;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(baseCanvas.current, 0, 0);
    ctx.drawImage(overlayCanvas.current, 0, 0);
    const link = document.createElement('a');
    link.download = `${source.title.replace(/[^a-z0-9]+/gi, '_')}_annotated.png`;
    link.href = output.toDataURL('image/png');
    link.click();
  };

  const toolButtons = useMemo(() => [
    ['pan', MousePointer2, 'Pan'], ['pen', PenLine, 'Pen'], ['highlighter', Highlighter, 'Highlight'],
    ['line', Minus, 'Line'], ['arrow', ArrowUpRight, 'Arrow'], ['rect', Square, 'Box'],
    ['text', Type, 'Text'], ['erase', Eraser, 'Erase']
  ] as const, []);

  const width = overlayCanvas.current?.width || 1000;
  const height = overlayCanvas.current?.height || 1400;

  return <div className="chart-workspace">
    <div className="chart-toolbar">
      <div className="tool-group">
        {toolButtons.map(([name, Icon, label]) => <button key={name} className={tool === name ? 'active' : ''} onClick={() => setTool(name)} title={label}><Icon size={18} /><span>{label}</span></button>)}
      </div>
      <div className="tool-group compact">
        {COLORS.map(item => <button key={item} className={`color-chip ${color === item ? 'selected' : ''}`} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Ink ${item}`} />)}
      </div>
      <div className="tool-group compact">
        <button onClick={undo} disabled={!undoStack.length} title="Undo"><Undo2 size={18} /></button>
        <button onClick={redo} disabled={!redoStack.length} title="Redo"><Redo2 size={18} /></button>
        <button onClick={clear} disabled={!annotations.length} title="Clear markup"><RotateCcw size={18} /></button>
        <button onClick={() => setZoom(value => Math.max(.3, value - .1))} title="Zoom out"><ZoomOut size={18} /></button>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(value => Math.min(2.5, value + .1))} title="Zoom in"><ZoomIn size={18} /></button>
        <button className={night ? 'active' : ''} onClick={() => setNight(value => !value)}>Night</button>
        <button onClick={exportChart} disabled={!source}><Download size={18} /></button>
      </div>
    </div>
    <div className="chart-subbar">
      <strong>{source?.title || 'No chart selected'}</strong>
      <span>{status}</span>
      {pageCount > 1 && <div className="page-controls">
        <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>
        <span>{page} / {pageCount}</span>
        <button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Next</button>
      </div>}
    </div>
    <div className="chart-scroll">
      {!source && <div className="empty-chart"><PenLine size={42} /><h3>Chart desk ready</h3><p>Choose a Navigraph chart, SimBrief PDF, or local chart file.</p></div>}
      {source && <div className="chart-scaled" style={{ width: width * zoom, height: height * zoom }}>
        <div className="chart-stage" style={{ width, height, transform: `scale(${zoom})` }}>
          <canvas ref={baseCanvas} className={night ? 'chart-base night' : 'chart-base'} />
          <canvas ref={overlayCanvas} className={`chart-overlay ${tool === 'pan' ? 'pan' : ''}`}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
          {source.navigraph && <div className="chart-watermark">{watermark || 'Navigraph chart — authenticated simulator use only'}</div>}
        </div>
      </div>}
    </div>
  </div>;
}
