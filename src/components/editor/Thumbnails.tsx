import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Plus, RotateCcw, RotateCw, Copy, Trash2 } from 'lucide-react';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import type { PageModel } from '@/types/editor';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function PagePreview({ page, width = 120 }: { page: PageModel; width?: number }) {
  const session = usePdfEditor().session;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const turned = page.rotation === 90 || page.rotation === 270;
  const ratio = turned ? page.width / page.height : page.height / page.width;

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { root: node.closest('.thumbnail-list'), rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!session || !visible || page.sourceIndex === null) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<typeof session.pdf.getPage>>['render']> | null = null;
    const run = async () => {
      const pdfPage = await session.pdf.getPage(page.sourceIndex! + 1);
      const viewport = pdfPage.getViewport({ scale: width / (turned ? page.height : page.width), rotation: page.rotation });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      task = pdfPage.render({ canvasContext: context, viewport });
      try { await task.promise; if (!cancelled) setReady(true); } catch { /* Hidden thumbnail or interrupted render. */ }
    };
    void run();
    return () => { cancelled = true; try { task?.cancel(); } catch { /* Already rendered. */ } };
  }, [session, page.sourceIndex, page.rotation, page.height, page.width, width, turned, visible]);

  return <div ref={hostRef} className="thumbnail-sheet" style={{ width, aspectRatio: `${1} / ${ratio}` }}>
    {page.sourceIndex === null ? <span className="thumbnail-empty">Blank page</span> : <canvas ref={canvasRef} className="thumbnail-canvas" style={{ opacity: ready ? 1 : 0 }} />}
  </div>;
}

interface ThumbnailsProps {
  currentPageId: string;
  onNavigate(pageId: string): void;
  onManage(): void;
  onClose(): void;
}

export function Thumbnails({ currentPageId, onNavigate, onManage, onClose }: ThumbnailsProps) {
  const editor = usePdfEditor();

  return <aside className="thumbnail-panel" aria-label="Document pages">
    <div className="thumbnail-head"><h2>Pages <span>{editor.snapshot.pages.length}</span></h2><Button variant="ghost" size="sm" onClick={onClose} className="thumbnail-hide">Close</Button></div>
    <div className="thumbnail-list">
      {editor.snapshot.pages.map((page, index) => (
        <div key={page.id} className={`thumbnail-row ${page.id === currentPageId ? 'thumbnail-row-active' : ''}`}>
          <button className="thumbnail-button" onClick={() => onNavigate(page.id)} aria-label={`Go to page ${index + 1}`}>
            <PagePreview page={page} width={132} />
            <span>{index + 1}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="thumbnail-more" aria-label={`Page ${index + 1} actions`}><MoreHorizontal size={17} /></button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => editor.movePage(page.id, -1)} disabled={index === 0}><ChevronUp size={15} /> Move up</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.movePage(page.id, 1)} disabled={index === editor.snapshot.pages.length - 1}><ChevronDown size={15} /> Move down</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.rotatePage(page.id, -90)}><RotateCcw size={15} /> Rotate left</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.rotatePage(page.id, 90)}><RotateCw size={15} /> Rotate right</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.duplicatePage(page.id)}><Copy size={15} /> Duplicate</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.deletePage(page.id)} disabled={editor.snapshot.pages.length < 2} className="text-red-500"><Trash2 size={15} /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
    <div className="thumbnail-foot"><Button variant="outline" size="sm" onClick={() => editor.insertPage(editor.snapshot.pages.length)}><Plus size={15} /> Add page</Button><Button variant="ghost" size="sm" onClick={onManage}>Manage pages</Button></div>
  </aside>;
}
