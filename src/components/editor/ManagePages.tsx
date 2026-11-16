import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PagePreview } from '@/components/editor/Thumbnails';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import type { PageModel, PdfElement } from '@/types/editor';
import { uid } from '@/lib/utils';

export function ManagePages({ open, onOpenChange }: { open: boolean; onOpenChange(value: boolean): void }) {
  const editor = usePdfEditor();
  const [draft, setDraft] = useState<PageModel[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [clonedElements, setClonedElements] = useState<Record<string, PdfElement[]>>({});

  useEffect(() => {
    if (open) { setDraft(structuredClone(editor.snapshot.pages)); setSelection([]); setClonedElements({}); }
  }, [open]);

  const selectedPages = selection.length ? selection : draft.map(page => page.id).slice(0, 1);
  const rotate = (delta: number) => setDraft(pages => pages.map(page => selection.includes(page.id) ? { ...page, rotation: (page.rotation + delta + 360) % 360 } : page));
  const remove = () => {
    if (draft.length - selection.length < 1) { editor.notify('At least one page must remain.'); return; }
    setDraft(pages => pages.filter(page => !selection.includes(page.id)));
    setSelection([]);
  };
  const duplicate = () => {
    const additions: Record<string, PdfElement[]> = {};
    const pages = draft.flatMap(page => {
      if (!selection.includes(page.id)) return [page];
      const id = uid('page');
      additions[id] = (clonedElements[page.id] || editor.snapshot.elements[page.id] || []).map(item => ({ ...structuredClone(item), id: uid('element') }));
      return [page, { ...page, id }];
    });
    setClonedElements(previous => ({ ...previous, ...additions }));
    setDraft(pages);
    setSelection([]);
  };
  const move = (delta: number) => {
    if (selection.length !== 1) return;
    setDraft(previous => {
      const pages = previous.slice();
      const from = pages.findIndex(page => page.id === selection[0]);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= pages.length) return previous;
      [pages[from], pages[to]] = [pages[to], pages[from]];
      return pages;
    });
  };
  const save = () => {
    editor.transact(previous => {
      const elements = { ...previous.elements, ...clonedElements };
      Object.keys(elements).forEach(id => { if (!draft.some(page => page.id === id)) delete elements[id]; });
      return { ...previous, pages: draft, elements };
    });
    onOpenChange(false);
    editor.notify('Page changes applied.');
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="manage-dialog">
      <div className="dialog-heading"><DialogTitle>Manage pages</DialogTitle><DialogDescription>Choose pages, then rearrange, rotate, duplicate, or delete them.</DialogDescription></div>
      <div className="manage-actions">
        <Button variant="outline" size="sm" onClick={() => setDraft(previous => [...previous, { id: uid('page'), sourceIndex: null, width: 595.28, height: 841.89, rotation: 0 }])}><Plus size={15} /> Blank page</Button>
        <Button variant="outline" size="sm" disabled={selection.length !== 1} onClick={() => move(-1)}><ArrowUp size={15} /> Move</Button>
        <Button variant="outline" size="sm" disabled={selection.length !== 1} onClick={() => move(1)}><ArrowDown size={15} /> Move</Button>
        <Button variant="outline" size="sm" disabled={!selection.length} onClick={() => rotate(-90)}><RotateCcw size={15} /></Button>
        <Button variant="outline" size="sm" disabled={!selection.length} onClick={() => rotate(90)}><RotateCw size={15} /></Button>
        <Button variant="outline" size="sm" disabled={!selection.length} onClick={duplicate}><Copy size={15} /></Button>
        <Button variant="outline" size="sm" disabled={!selection.length || selection.length >= draft.length} onClick={remove}><Trash2 size={15} /></Button>
      </div>
      <div className="manage-grid">
        {draft.map((page, index) => <button key={page.id} className={`manage-page ${selection.includes(page.id) ? 'manage-page-selected' : ''}`} onClick={() => setSelection(previous => previous.includes(page.id) ? previous.filter(id => id !== page.id) : [...previous, page.id])} aria-pressed={selection.includes(page.id)}>
          <div className="manage-check">{selection.includes(page.id) && <Check size={13} />}</div>
          <PagePreview page={page} width={105} />
          <span>Page {index + 1}</span>
        </button>)}
      </div>
      <div className="manage-footer"><span>{selection.length} selected · {draft.length} total pages</span><div><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save changes</Button></div></div>
    </DialogContent>
  </Dialog>;
}
