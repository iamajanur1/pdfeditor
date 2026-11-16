import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eraser, FileDown, Files, ImagePlus, PenLine, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import { documentToImages, downloadBlob, exportEditedPdf, getFormFields, mergeDocuments, pdfToText, pdfToDocx, pdfToHtml, pdfToJson, pdfToMarkdown, pdfToEpub, splitDocument } from '@/lib/pdf';
import { readableError, uid } from '@/lib/utils';
import type { FormFieldInfo, PdfElement } from '@/types/editor';

const PRESET_STAMPS = ['APPROVED', 'NOT APPROVED', 'DRAFT', 'FINAL', 'COMPLETED', 'CONFIDENTIAL', 'VOID', 'REVIEWED', 'COPY', 'RECEIVED', 'PAID', 'SIGN HERE'];

export function StampDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const editor = usePdfEditor();
  const [custom, setCustom] = useState('');
  const choose = (value: string) => { editor.setDefaults({ stamp: value }); editor.setTool('stamp'); editor.select(null); onClose(); editor.notify('Tap or click the document to place your stamp.'); };
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent><div className="dialog-heading"><DialogTitle>Choose a stamp</DialogTitle><DialogDescription>Select a preset or create a custom stamp, then place it on the PDF.</DialogDescription></div>
      <div className="stamp-grid">{PRESET_STAMPS.map(text => <button key={text} className="stamp-choice" onClick={() => choose(text)}>{text}</button>)}</div>
      <div className="custom-stamp"><input aria-label="Custom stamp text" value={custom} onChange={event => setCustom(event.target.value)} placeholder="Custom stamp text" maxLength={25} /><Button disabled={!custom.trim()} onClick={() => choose(custom.trim().toUpperCase())}>Use stamp</Button></div>
    </DialogContent>
  </Dialog>;
}

interface SignatureRecord { id: string; name: string; dataUrl: string }
const signatureStorageKey = 'paprify-signatures-v2';

export function SignatureDialog({ open, onClose, pageId }: { open: boolean; onClose(): void; pageId: string }) {
  const editor = usePdfEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [records, setRecords] = useState<SignatureRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem(signatureStorageKey) || '[]') as SignatureRecord[]; } catch { return []; }
  });
  const [name, setName] = useState('My signature');

  const coords = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 210 / rect.height];
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault(); drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = coords(event); const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    context.beginPath(); context.moveTo(x, y);
    context.lineTo(x + .01, y + .01); context.stroke();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const [x, y] = coords(event);
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    context.strokeStyle = '#142b4a'; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
    context.lineTo(x, y); context.stroke();
  };
  const clear = () => canvasRef.current?.getContext('2d')?.clearRect(0, 0, 600, 210);
  const insert = (dataUrl: string) => {
    const page = editor.snapshot.pages.find(page => page.id === pageId) || editor.snapshot.pages[0];
    if (!page) return;
    const image = new Image();
    image.onload = () => {
      const width = Math.min(220, page.width * .45);
      const height = Math.max(24, Math.min(100, width * image.height / image.width));
      editor.addElement(page.id, { id: uid('element'), type: 'signature', dataUrl, x: (page.width - width) / 2, y: page.height * .58, width, height, color: '#142b4a', opacity: 1, strokeWidth: 1 });
      onClose();
    };
    image.src = dataUrl;
  };
  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
    if (!data) return;
    let x0 = data.width, y0 = data.height, x1 = -1, y1 = -1;
    for (let y = 0; y < data.height; y++) for (let x = 0; x < data.width; x++) {
      const alpha = data.data[(y * data.width + x) * 4 + 3];
      if (alpha > 12) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < x0) { editor.notify('Draw your signature first.'); return; }
    const cut = document.createElement('canvas');
    cut.width = x1 - x0 + 12; cut.height = y1 - y0 + 12;
    cut.getContext('2d')?.drawImage(canvas, x0 - 6, y0 - 6, cut.width, cut.height, 0, 0, cut.width, cut.height);
    const dataUrl = cut.toDataURL('image/png');
    const next = [...records, { id: uid('signature'), name: name.trim() || 'Signature', dataUrl }];
    setRecords(next); localStorage.setItem(signatureStorageKey, JSON.stringify(next));
    insert(dataUrl); clear();
  };
  const deleteRecord = (id: string) => {
    const next = records.filter(record => record.id !== id);
    setRecords(next); localStorage.setItem(signatureStorageKey, JSON.stringify(next));
  };

  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="signature-dialog"><div className="dialog-heading"><DialogTitle>Signature</DialogTitle><DialogDescription>Draw your signature or select a saved one. Saved signatures stay in this browser.</DialogDescription></div>
      {records.length > 0 && <div className="signature-library">{records.map(record => <div className="saved-signature" key={record.id}><button onClick={() => insert(record.dataUrl)}><img src={record.dataUrl} alt={record.name} /><span>{record.name}</span></button><button title="Delete saved signature" onClick={() => deleteRecord(record.id)}><Trash2 size={16} /></button></div>)}</div>}
      <canvas ref={canvasRef} width={600} height={210} className="signature-canvas" aria-label="Draw signature" onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} />
      <div className="signature-actions"><Button variant="outline" size="sm" onClick={clear}><Eraser size={15} /> Clear</Button><input aria-label="Signature name" value={name} onChange={event => setName(event.target.value)} maxLength={40} /><Button onClick={saveSignature}><Check size={16} /> Save & place</Button></div>
    </DialogContent>
  </Dialog>;
}

export function NoteDialog({ target, onClose }: { target: { pageId: string; element: PdfElement } | null; onClose(): void }) {
  const editor = usePdfEditor();
  const [text, setText] = useState('');
  useEffect(() => { if (target) setText(target.element.text || ''); }, [target]);
  return <Dialog open={!!target} onOpenChange={value => { if (!value) onClose(); }}><DialogContent><DialogTitle>Sticky note</DialogTitle><DialogDescription>Write a comment. The exported PDF will contain a native text annotation.</DialogDescription><textarea className="note-textarea" rows={5} value={text} onChange={event => setText(event.target.value)} /><div className="dialog-footer"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { if (target) editor.updateElement(target.pageId, target.element.id, { text }); onClose(); }}>Save note</Button></div></DialogContent></Dialog>;
}

export function FormsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const editor = usePdfEditor();
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !editor.session) return;
    setLoading(true);
    getFormFields(editor.session).then(setFields).catch(() => setFields([])).finally(() => setLoading(false));
  }, [open, editor.session]);
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="forms-dialog"><div className="dialog-heading"><DialogTitle>Fill PDF form</DialogTitle><DialogDescription>Complete supported interactive text, checkbox and dropdown fields.</DialogDescription></div>
    <div className="form-fields-list">{loading ? <p>Looking for form fields…</p> : fields.length === 0 ? <p>No supported interactive form fields were found. You can still use Add text and Check tools to fill a flat document.</p> : fields.map(field => <label key={field.name}>
      <span>{field.name}</span>
      {field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.checked)} /> : field.type === 'dropdown' ?
        <select value={String(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.value)}>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select> :
        <input type="text" value={String(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.value)} disabled={field.type === 'other'} />}
    </label>)}</div>
    <div className="dialog-footer"><Button onClick={onClose}>Done</Button></div>
  </DialogContent></Dialog>;
}

export type Utility = 'merge' | 'split' | 'pdf-to-png' | 'pdf-to-jpg' | 'pdf-to-webp' | 'pdf-to-text' | 'pdf-to-docx' | 'pdf-to-html' | 'pdf-to-json' | 'pdf-to-markdown' | 'pdf-to-epub' | null;

function parseRanges(value: string, count: number): number[] {
  const result = new Set<number>();
  value.split(',').forEach(fragment => {
    const token = fragment.trim();
    if (/^\d+$/.test(token)) { const page = Number(token); if (page >= 1 && page <= count) result.add(page); }
    else if (/^\d+\s*-\s*\d+$/.test(token)) {
      const [first, last] = token.split('-').map(Number);
      if (last >= first && last - first < 10000) for (let n = first; n <= last; n++) if (n >= 1 && n <= count) result.add(n);
    }
  });
  return [...result].sort((a, b) => a - b);
}

export function UtilityDialog({ utility, onClose }: { utility: Utility; onClose(): void }) {
  const editor = usePdfEditor();
  const [pages, setPages] = useState('1');
  const [files, setFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);
  const count = editor.snapshot.pages.length;
  const run = async () => {
    if (!editor.session || !utility) return;
    setWorking(true);
    try {
      const name = editor.session.name.replace(/\.pdf$/i, '');
      if (utility === 'merge') {
        if (!files.length) { editor.notify('Choose one or more PDFs to append.'); return; }
        const current = await exportEditedPdf(editor.session, editor.snapshot);
        const base = { ...editor.session, bytes: current };
        const bytes = await mergeDocuments(base, files);
        await editor.loadBytes(bytes, `${name}-merged.pdf`);
        editor.notify('Documents merged. Export to download the result.');
      } else if (utility === 'split') {
        const numbers = parseRanges(pages, count);
        if (!numbers.length) { editor.notify('Enter valid page numbers, for example 1,3-5.'); return; }
        const bytes = await splitDocument(editor.session, editor.snapshot, numbers);
        downloadBlob(bytes, `${name}-pages.pdf`);
      } else if (utility === 'pdf-to-text') {
        const text = await pdfToText(editor.session, editor.snapshot);
        downloadBlob(text, `${name}.txt`, 'text/plain;charset=utf-8');
      } else if (utility === 'pdf-to-docx') {
        const result = await pdfToDocx(editor.session, editor.snapshot);
        downloadBlob(result, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else if (utility === 'pdf-to-html') {
        downloadBlob(await pdfToHtml(editor.session, editor.snapshot), `${name}.html`, 'text/html;charset=utf-8');
      } else if (utility === 'pdf-to-json') {
        downloadBlob(await pdfToJson(editor.session, editor.snapshot), `${name}.json`, 'application/json;charset=utf-8');
      } else if (utility === 'pdf-to-markdown') {
        downloadBlob(await pdfToMarkdown(editor.session, editor.snapshot), `${name}.md`, 'text/markdown;charset=utf-8');
      } else if (utility === 'pdf-to-epub') {
        downloadBlob(await pdfToEpub(editor.session, editor.snapshot), `${name}.epub`, 'application/epub+zip');
      } else if (utility === 'pdf-to-jpg' || utility === 'pdf-to-png' || utility === 'pdf-to-webp') {
        const kind = utility === 'pdf-to-jpg' ? 'jpeg' : utility === 'pdf-to-webp' ? 'webp' : 'png';
        const zip = await documentToImages(editor.session, editor.snapshot, kind);
        downloadBlob(zip, `${name}-${kind}-pages.zip`, 'application/zip');
      }
      onClose();
    } catch (error) { editor.notify(`Operation failed: ${readableError(error)}`); }
    finally { setWorking(false); }
  };

  const titles: Record<NonNullable<Utility>, string> = {
    merge: 'Merge PDFs', split: 'Extract pages', 'pdf-to-png': 'PDF to PNG',
    'pdf-to-jpg': 'PDF to JPG', 'pdf-to-webp': 'PDF to WebP',
    'pdf-to-text': 'PDF to text', 'pdf-to-docx': 'PDF to Word (text)',
    'pdf-to-html': 'PDF to HTML (text)', 'pdf-to-json': 'PDF to JSON',
    'pdf-to-markdown': 'PDF to Markdown', 'pdf-to-epub': 'PDF to EPUB (text)',
  };
  return <Dialog open={!!utility} onOpenChange={value => { if (!value && !working) onClose(); }}><DialogContent><div className="dialog-heading"><DialogTitle>{utility ? titles[utility] : 'Document tool'}</DialogTitle><DialogDescription>{utility === 'merge' ? 'Append additional PDF files to your current document.' : utility === 'split' ? 'Select which pages to download as a new PDF.' : 'Convert your current document locally in your browser.'}</DialogDescription></div>
    {utility === 'merge' && <div className="dialog-form"><label>Add PDF files<input type="file" multiple accept=".pdf,application/pdf" onChange={event => setFiles(Array.from(event.target.files || []))} /></label><p>{files.length} additional file(s) selected</p></div>}
    {utility === 'split' && <div className="dialog-form"><label>Page numbers or range<input value={pages} onChange={event => setPages(event.target.value)} placeholder="1,3-5" /></label><small>Current document: {count} pages. Separate ranges with commas.</small></div>}
    {utility === 'pdf-to-png' || utility === 'pdf-to-jpg' || utility === 'pdf-to-webp' ? <p className="operation-note">All pages will be exported as images in a ZIP archive. Rendering large PDFs may use substantial memory.</p> : null}
    {utility === 'pdf-to-docx' && <p className="operation-note">Exports selectable text to an editable Word document. Original PDF layout, graphics and exact fonts are not preserved.</p>}
    {utility === 'pdf-to-html' && <p className="operation-note">Creates readable HTML from document text; not an exact copy of the PDF's layout.</p>}
    {utility === 'pdf-to-epub' && <p className="operation-note">Creates a reflowable ebook from selectable text. PDF images and original page layout are not preserved.</p>}
    {utility === 'pdf-to-markdown' && <p className="operation-note">Exports text as Markdown with page headings; it cannot reconstruct original headings or tables.</p>}
    {utility === 'pdf-to-json' && <p className="operation-note">Exports structured text grouped by page and line.</p>}
    {utility === 'pdf-to-text' && <p className="operation-note">Selectable text can be extracted; scanned-image PDFs require OCR, which is not included.</p>}
    <div className="dialog-footer"><Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button><Button disabled={working} onClick={run}>{working ? 'Processing…' : utility === 'merge' ? 'Merge files' : 'Download result'} <ArrowRight size={15} /></Button></div>
  </DialogContent></Dialog>;
}
