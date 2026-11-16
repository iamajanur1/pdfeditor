import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { fromOutputPoint } from '@/lib/pdf';
import { uid } from '@/lib/utils';
import { splitPdfTextLines } from '@/lib/textLayout';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import { InlineTextEditor, type InlineTextDraft, type InlineTextTarget } from '@/components/editor/InlineTextEditor';
import type { ElementType, PageModel, PdfElement, Point, TextRegion, Tool } from '@/types/editor';

interface CanvasPageProps {
  page: PageModel;
  pageNumber: number;
  zoom: number;
  onEditElement(pageId: string, item: PdfElement): void;
  onEditExisting(region: TextRegion): void;
  onEditNote(pageId: string, element: PdfElement): void;
  inlineTarget: InlineTextTarget;
  inlineDraft: InlineTextDraft | null;
  onInlineChange(changes: Partial<InlineTextDraft>): void;
  onInlineCommit(): void;
  onInlineCancel(): void;
}

interface Interaction {
  kind: 'move' | 'resize' | 'create';
  start: Point;
  current: Point;
  initial?: PdfElement;
  elementId?: string;
  points?: Point[];
}

const cachedText = new WeakMap<object, Map<number, Omit<TextRegion, 'pageId'>[]>>();

const creationTools: Tool[] = ['draw', 'highlight', 'rectangle', 'ellipse', 'line', 'arrow', 'polygon', 'cloud', 'polyline'];
const rectPath = (item: PdfElement): string => {
  if (item.type === 'polygon') {
    const w = item.width;
    const h = item.height;
    return `M ${item.x + w * .25},${item.y} L ${item.x + w * .75},${item.y} L ${item.x + w},${item.y + h * .5} L ${item.x + w * .75},${item.y + h} L ${item.x + w * .25},${item.y + h} L ${item.x},${item.y + h * .5} Z`;
  }
  const x = item.x, y = item.y, w = item.width, h = item.height;
  return `M ${x + .2 * w},${y + .8 * h} C ${x - .1 * w},${y + .8 * h} ${x - .07 * w},${y + .25 * h} ${x + .25 * w},${y + .28 * h} C ${x + .3 * w},${y - .1 * h} ${x + .66 * w},${y - .06 * h} ${x + .74 * w},${y + .27 * h} C ${x + 1.08 * w},${y + .25 * h} ${x + 1.08 * w},${y + .83 * h} ${x + .72 * w},${y + .8 * h} Z`;
};

function selectionOutline(item: PdfElement, zoom: number) {
  const x = item.x, y = item.y, w = item.width, h = item.height;
  const size = Math.max(3, 4.5 / zoom);
  return (
    <g className="element-outline" pointerEvents="none">
      <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} fill="none" stroke="#2266e5" strokeWidth={1.4 / zoom} />
      {[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy], i) => (
        <rect key={i} x={cx - size / 2} y={cy - size / 2} width={size} height={size} fill="#fff" stroke="#2266e5" strokeWidth={1 / zoom} />
      ))}
    </g>
  );
}

function SvgItem({ item, selected, zoom, onPointerDown, onDoubleClick }: {
  item: PdfElement;
  selected: boolean;
  zoom: number;
  onPointerDown(event: React.PointerEvent<SVGGElement>): void;
  onDoubleClick(): void;
}) {
  const common = { opacity: item.opacity, stroke: item.color, strokeWidth: item.strokeWidth };
  const x = item.x, y = item.y, w = item.width, h = item.height;
  const textLines = splitPdfTextLines(item.text || '');
  const body = (() => {
    switch (item.type) {
      case 'highlight':
        return <rect x={x} y={y} width={w} height={h} fill={item.color} opacity={Math.min(item.opacity, .6)} />;
      case 'drawing':
      case 'polyline':
        return <polyline points={(item.points || []).map(point => point.join(',')).join(' ')} fill="none" {...common} strokeLinecap="round" strokeLinejoin="round" />;
      case 'rectangle':
        return <rect x={x} y={y} width={w} height={h} fill={item.fill || 'none'} {...common} />;
      case 'ellipse':
        return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={item.fill || 'none'} {...common} />;
      case 'polygon':
      case 'cloud':
        return <path d={rectPath(item)} fill={item.fill || 'none'} {...common} />;
      case 'line':
      case 'arrow': {
        const endX = x + w, endY = y + h;
        const angle = Math.atan2(h, w);
        const wing = (sign: number) => `${endX - 13 * Math.cos(angle + sign * .55)},${endY - 13 * Math.sin(angle + sign * .55)}`;
        return <g fill="none" {...common} strokeLinecap="round"><line x1={x} y1={y} x2={endX} y2={endY} />{item.type === 'arrow' && <polyline points={`${wing(-1)} ${endX},${endY} ${wing(1)}`} />}</g>;
      }
      case 'cross':
        return <g fill="none" {...common} strokeWidth={item.strokeWidth + 2} strokeLinecap="round"><line x1={x} y1={y} x2={x + w} y2={y + h} /><line x1={x + w} y1={y} x2={x} y2={y + h} /></g>;
      case 'check':
        return <polyline points={`${x},${y + h * .5} ${x + w * .38},${y + h * .88} ${x + w},${y}`} fill="none" {...common} strokeWidth={item.strokeWidth + 2} strokeLinecap="round" strokeLinejoin="round" />;
      case 'image':
      case 'signature':
        return <image href={item.dataUrl} x={x} y={y} width={w} height={h} opacity={item.opacity} preserveAspectRatio="none" />;
      case 'note':
        return <g><rect x={x} y={y} width={22} height={22} rx={3} fill="#ffdf71" stroke="#b88a22" strokeWidth="1"/><path d={`M${x + 5} ${y + 7}h12M${x + 5} ${y + 11}h12M${x + 5} ${y + 15}h8`} stroke="#6b5318" strokeWidth="1.2"/></g>;
      case 'stamp':
        return <g><rect x={x} y={y} width={w} height={h} fill="none" stroke={item.color} strokeWidth={2.2} />
          <text x={x + w / 2} y={y + h / 2 + (item.fontSize || 15) * .34} fill={item.color} fontSize={item.fontSize || 15} textAnchor="middle" fontWeight="bold" letterSpacing="1">{item.text}</text></g>;
      case 'replacement':
      case 'text':
        return <g>
          {item.type === 'replacement' && <rect x={x} y={y} width={item.coverWidth || w} height={item.coverHeight || h} fill={item.background || '#ffffff'} />}
          <text x={x} y={y + (item.fontSize || 16)} fontSize={item.fontSize || 16} fontFamily={item.fontFamily || 'Arial'} fontWeight={item.bold ? 700 : 400} fontStyle={item.italic ? 'italic' : 'normal'} textDecoration={item.underline ? 'underline' : 'none'} fill={item.color} opacity={item.opacity}>
            {textLines.map((line, index) => <tspan key={index} x={item.align === 'center' ? x + w / 2 : item.align === 'right' ? x + w : x} textAnchor={item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'} dy={index ? (item.fontSize || 16) * 1.22 : 0}>{line || '\u00A0'}</tspan>)}
          </text>
        </g>;
    }
  })();

  return <g data-element={item.id} className="pdf-object" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
    {body}
    {item.type === 'line' || item.type === 'arrow' || item.type === 'drawing' || item.type === 'polyline' ? <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="transparent" /> : null}
    {selected && selectionOutline(item, zoom)}
  </g>;
}

function createElement(tool: Tool, start: Point, end: Point, settings: ReturnType<typeof usePdfEditor>['defaults'], points: Point[]): PdfElement {
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  const width = Math.max(1, Math.abs(end[0] - start[0]));
  const height = Math.max(1, Math.abs(end[1] - start[1]));
  const type = tool === 'draw' ? 'drawing' : tool as ElementType;
  return {
    id: uid('element'), type, x, y, width, height,
    fontFamily: settings.fontFamily, fontSize: settings.fontSize,
    bold: settings.bold, italic: settings.italic, underline: settings.underline, align: settings.align,
    color: settings.color, fill: settings.fill, strokeWidth: settings.strokeWidth,
    opacity: tool === 'highlight' ? Math.min(settings.opacity, .38) : settings.opacity,
    points: (tool === 'draw' || tool === 'polyline') ? points : undefined,
  };
}

export function CanvasPage({ page, pageNumber, zoom, onEditElement, onEditExisting, onEditNote, inlineTarget, inlineDraft, onInlineChange, onInlineCommit, onInlineCancel }: CanvasPageProps) {
  const editor = usePdfEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [preview, setPreview] = useState<PdfElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [regions, setRegions] = useState<TextRegion[]>([]);
  const [renderError, setRenderError] = useState(false);
  const originalRotation = page.rotation % 360;
  const turned = originalRotation === 90 || originalRotation === 270;
  const viewportWidth = (turned ? page.height : page.width);
  const viewportHeight = (turned ? page.width : page.height);
  const elements = editor.snapshot.elements[page.id] || [];
  const selection = editor.selected;
  const inlineOnPage = inlineTarget && (inlineTarget.kind === 'existing' ? inlineTarget.region.pageId : inlineTarget.pageId) === page.id ? inlineTarget : null;
  const selectedId = selection?.kind === 'element' && selection.pageId === page.id ? selection.elementId : null;

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const element = containerRef.current;
    const root = element.closest('.document-scroll');
    const observer = new IntersectionObserver(entries => { setVisible(Boolean(entries[0]?.isIntersecting)); }, { root, rootMargin: '520px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [page.id]);

  useEffect(() => {
    if (!visible && canvasRef.current) {
      // Release large raster buffers when a page moves far out of view.
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
    }
  }, [visible]);

  useEffect(() => {
    if (!editor.session || !visible || page.sourceIndex === null) return;
    let cancelled = false;
    let task: { promise: Promise<void>; cancel(): void } | null = null;
    const run = async () => {
      const sourcePage = await editor.session!.pdf.getPage(page.sourceIndex! + 1);
      const viewport = sourcePage.getViewport({ scale: zoom * Math.min(window.devicePixelRatio || 1, 2), rotation: page.rotation });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.clearRect(0, 0, canvas.width, canvas.height);
      task = sourcePage.render({ canvasContext: context, viewport });
      try { await task.promise; } catch (error) { if (!cancelled) setRenderError(true); }
    };
    void run();
    return () => { cancelled = true; try { task?.cancel(); } catch { /* A completed render does not need cancellation. */ } };
  }, [editor.session, page.sourceIndex, page.rotation, zoom, visible]);

  useEffect(() => {
    if (!editor.session || page.sourceIndex === null || !visible) return;
    let cancelled = false;
    (async () => {
      const cacheOwner = editor.session!.pdf;
      const cache = cachedText.get(cacheOwner) || new Map<number, Omit<TextRegion, 'pageId'>[]>();
      const stored = cache.get(page.sourceIndex!);
      if (stored) { if (!cancelled) setRegions(stored.map(region => ({ ...region, pageId: page.id }))); return; }
      const source = await cacheOwner.getPage(page.sourceIndex! + 1);
      const text = await source.getTextContent();
      const viewport = source.getViewport({ scale: 1, rotation: 0 });
      const result: TextRegion[] = [];
      text.items.forEach((item, index) => {
        if (!('str' in item) || !item.str?.trim()) return;
        const t = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.max(3, Math.hypot(t[2], t[3]));
        const style = text.styles[item.fontName];
        const ascent = Math.min(1, style?.ascent || .88);
        const fontFamily = style?.fontFamily || 'Arial';
        const y = t[5] - fontSize * ascent;
        const width = Math.max(5, item.width || item.str.length * fontSize * .5);
        result.push({
          id: String(index), pageId: page.id, text: item.str,
          x: t[4], y, width, height: fontSize * 1.16,
          fontSize, fontFamily,
          bold: /bold|black|heavy/i.test(fontFamily + ' ' + item.fontName),
          italic: /italic|oblique/i.test(fontFamily + ' ' + item.fontName),
        });
      });
      cache.set(page.sourceIndex!, result.map(({ pageId: _pageId, ...region }) => region));
      cachedText.set(cacheOwner, cache);
      if (!cancelled) setRegions(result);
    })().catch(() => { if (!cancelled) setRegions([]); });
    return () => { cancelled = true; };
  }, [editor.session, page.id, page.sourceIndex, visible]);

  const getPoint = useCallback((event: React.PointerEvent<SVGSVGElement> | React.PointerEvent<SVGGElement>): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    const point: Point = [(event.clientX - rect.left) / zoom, (event.clientY - rect.top) / zoom];
    return fromOutputPoint(point, page);
  }, [page, zoom]);

  const selectItem = (event: React.PointerEvent<SVGGElement>, item: PdfElement) => {
    if (editor.tool === 'erase') {
      editor.removeElement(page.id, item.id);
      return;
    }
    if (editor.tool !== 'select' && editor.tool !== 'edit-text') return;
    event.stopPropagation();
    if (editor.tool === 'edit-text' && (item.type === 'text' || item.type === 'replacement' || item.type === 'stamp')) {
      onEditElement(page.id, item);
      return;
    }
    editor.select({ kind: 'element', pageId: page.id, elementId: item.id });
    const point = getPoint(event);
    interactionRef.current = { kind: 'move', start: point, current: point, initial: structuredClone(item), elementId: item.id };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startResize = (event: React.PointerEvent<SVGCircleElement>, item: PdfElement) => {
    event.stopPropagation();
    interactionRef.current = { kind: 'resize', start: getPoint(event), current: getPoint(event), initial: structuredClone(item), elementId: item.id };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const start = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = getPoint(event);
    const active = editor.tool;
    if (active === 'select' || active === 'edit-text') {
      if (inlineOnPage) onInlineCommit();
      editor.select(null);
      return;
    }
    if (active === 'text') {
      const item = createElement('text', point, [point[0] + 230, point[1] + 38], editor.defaults, []);
      item.text = 'Enter text';
      editor.addElement(page.id, item);
      onEditElement(page.id, item);
      editor.setTool('select');
      return;
    }
    if (active === 'check' || active === 'cross' || active === 'stamp' || active === 'note') {
      const widths = active === 'stamp' ? [120, 36] : active === 'note' ? [22, 22] : [23, 23];
      const item = createElement(active, point, [point[0] + widths[0], point[1] + widths[1]], editor.defaults, []);
      if (active === 'stamp') { item.text = editor.defaults.stamp; item.color = '#bb3047'; item.fontSize = 15; }
      if (active === 'note') { item.text = 'Write your note here'; item.color = '#f6d262'; }
      editor.addElement(page.id, item);
      if (active === 'note') onEditNote(page.id, item);
      editor.setTool('select');
      return;
    }
    if (creationTools.includes(active)) {
      event.preventDefault();
      interactionRef.current = { kind: 'create', start: point, current: point, points: [point] };
      svgRef.current?.setPointerCapture(event.pointerId);
    }
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const point = getPoint(event);
    interaction.current = point;
    if (interaction.kind === 'create') {
      if (editor.tool === 'draw' || editor.tool === 'polyline') interaction.points?.push(point);
      setPreview(createElement(editor.tool, interaction.start, point, editor.defaults, interaction.points || []));
      return;
    }
    if (interaction.initial) {
      const first = interaction.initial;
      const deltaX = point[0] - interaction.start[0];
      const deltaY = point[1] - interaction.start[1];
      const changes = interaction.kind === 'resize'
        ? { width: Math.max(6, first.width + deltaX), height: Math.max(6, first.height + deltaY) }
        : { x: first.x + deltaX, y: first.y + deltaY, points: first.points?.map(p => [p[0] + deltaX, p[1] + deltaY] as Point) };
      setPreview({ ...first, ...changes });
    }
  };

  const end = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    interactionRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    const point = interaction.current;
    if (interaction.kind === 'create') {
      const distance = Math.hypot(point[0] - interaction.start[0], point[1] - interaction.start[1]);
      if (distance >= 4) {
        const item = createElement(editor.tool, interaction.start, point, editor.defaults, interaction.points || []);
        editor.addElement(page.id, item);
      }
      setPreview(null);
      return;
    }
    if (preview && interaction.initial && interaction.elementId) {
      const delta = Math.abs(preview.x - interaction.initial.x) + Math.abs(preview.y - interaction.initial.y) + Math.abs(preview.width - interaction.initial.width) + Math.abs(preview.height - interaction.initial.height);
      if (delta > 0.5) editor.updateElement(page.id, interaction.elementId, preview);
    }
    setPreview(null);
  };

  const transform = originalRotation === 90 ? `translate(${page.height} 0) rotate(90)`
    : originalRotation === 180 ? `translate(${page.width} ${page.height}) rotate(180)`
      : originalRotation === 270 ? `translate(0 ${page.width}) rotate(270)` : '';
  const activeElements = useMemo(() => elements.map(item => preview?.id === item.id ? preview : item), [elements, preview]);
  const hiddenRegions = new Set(elements.filter(item => item.type === 'replacement').map(item => item.textRegionId));
  const touchAction = ['select', 'edit-text', 'erase'].includes(editor.tool) ? 'pan-x pan-y' : 'none';

  return <div className="page-shell" data-page-id={page.id} ref={containerRef} style={{ width: viewportWidth * zoom, height: viewportHeight * zoom }}>
    {page.sourceIndex === null ? <div className="blank-page" /> : <canvas ref={canvasRef} className="page-canvas" aria-label={`Rendered PDF page ${pageNumber}`} />}
    {renderError && <p className="page-error">This page could not be rendered.</p>}
    <svg ref={svgRef} className="page-overlay" width="100%" height="100%" viewBox={`0 0 ${viewportWidth} ${viewportHeight}`} style={{ touchAction }} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { interactionRef.current = null; setPreview(null); }}>
      <g transform={transform}>
        {regions.filter(region => !hiddenRegions.has(region.id)).map(region => {
          const current = selection?.kind === 'existing' && selection.pageId === page.id && selection.region.id === region.id;
          return <g key={region.id}>
            <rect className="native-text-hitbox" x={region.x} y={region.y} width={region.width} height={region.height} fill="transparent"
              onPointerDown={event => {
                if (editor.tool !== 'select' && editor.tool !== 'edit-text') return;
                event.stopPropagation();
                editor.select({ kind: 'existing', pageId: page.id, region });
                onEditExisting(region);
              }}
              onDoubleClick={() => onEditExisting(region)}
            />
            {current && <g pointerEvents="none"><rect x={region.x} y={region.y} width={region.width} height={region.height} fill="none" stroke="#2266e5" strokeWidth={1.5 / zoom} /><circle cx={region.x} cy={region.y + region.height / 2} r={5 / zoom} fill="#2266e5" /><circle cx={region.x + region.width} cy={region.y + region.height / 2} r={5 / zoom} fill="#2266e5" /></g>}
          </g>;
        })}
        {activeElements.map(item => {
          const isSelected = selectedId === item.id;
          return <g key={item.id}>
            <SvgItem item={item} selected={isSelected} zoom={zoom} onPointerDown={event => selectItem(event, item)} onDoubleClick={() => item.type === 'note' ? onEditNote(page.id, item) : (['text', 'replacement', 'stamp'].includes(item.type) ? onEditElement(page.id, item) : undefined)} />
            {isSelected && <circle className="resize-handle" cx={item.x + item.width} cy={item.y + item.height} r={Math.max(4, 7 / zoom)} fill="#fff" stroke="#2266e5" strokeWidth={1.5 / zoom} onPointerDown={event => startResize(event, item)} />}
          </g>;
        })}
        {preview && interactionRef.current?.kind === 'create' && <SvgItem item={preview} selected={false} zoom={zoom} onPointerDown={() => {}} onDoubleClick={() => {}} />}
        {inlineOnPage && inlineDraft && <InlineTextEditor
          target={inlineOnPage} draft={inlineDraft} pageWidth={page.width}
          update={onInlineChange} commit={onInlineCommit} cancel={onInlineCancel}
        />}
      </g>
    </svg>
    <span className="page-number-badge">{pageNumber}</span>
  </div>;
}
