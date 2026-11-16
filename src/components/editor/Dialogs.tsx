import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eraser, FileDown, Files, ImagePlus, PenLine, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import { documentToImages, downloadBlob, exportEditedPdf, getFormFields, mergeDocuments, pdfToText, pdfToDocx, pdfToVisualDocx, pdfToHtml, pdfToVisualHtml, pdfToJson, pdfToMarkdown, pdfToEpub, splitDocument } from '@/lib/pdf';
import { readableError, uid } from '@/lib/utils';
import { conversionStatus, convertRemotely } from '@/lib/remoteConversion';
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
    try {
      localStorage.setItem(signatureStorageKey, JSON.stringify(next));
      setRecords(next);
    } catch {
      editor.notify('Browser storage is full. The signature will be placed but not saved for reuse.');
    }
    insert(dataUrl); clear();
  };
  const deleteRecord = (id: string) => {
    const next = records.filter(record => record.id !== id);
    setRecords(next);
    try { localStorage.setItem(signatureStorageKey, JSON.stringify(next)); }
    catch { editor.notify('Could not update saved signatures in this browser.'); }
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
      {field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.checked)} /> : (field.type === 'dropdown' || field.type === 'radio') ?
        <select value={String(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.value)}>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select> :
        <input type="text" value={String(editor.snapshot.fields[field.name] ?? field.value)} onChange={event => editor.setField(field.name, event.target.value)} disabled={field.type === 'other'} />}
    </label>)}</div>
    <div className="dialog-footer"><Button onClick={onClose}>Done</Button></div>
  </DialogContent></Dialog>;
}

export type Utility = 'merge' | 'split' | 'pdf-to-png' | 'pdf-to-jpg' | 'pdf-to-webp' | 'pdf-to-text' | 'pdf-to-docx' | 'pdf-to-html' | 'pdf-to-json' | 'pdf-to-markdown' | 'pdf-to-epub' | 'pdf-to-xlsx' | 'pdf-to-pptx' | null;

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
  const [imageRange, setImageRange] = useState('all');
  const [imageDpi, setImageDpi] = useState(200);
  const [imageQuality, setImageQuality] = useState(.9);
  const [htmlMode, setHtmlMode] = useState<'visual' | 'text'>('visual');
  const [wordMode, setWordMode] = useState<'editable' | 'visual' | 'enhanced' | 'ocr'>('editable');
  const [consent, setConsent] = useState(false);
  const [serverFeatures, setServerFeatures] = useState<Record<string, boolean> | null>(null);
  const count = editor.snapshot.pages.length;
  useEffect(() => {
    if (!utility) return;
    setConsent(false);
    let alive = true;
    void conversionStatus().then(info => { if (alive) setServerFeatures(info?.features ?? null); });
    return () => { alive = false; };
  }, [utility]);
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
        if (wordMode === 'enhanced' || wordMode === 'ocr') {
          if (!consent) throw new Error('Please confirm server processing first.');
          if (!serverFeatures?.[wordMode === 'ocr' ? 'pdf_to_ocr_docx' : 'pdf_to_docx']) throw new Error('The selected Word conversion engine is unavailable.');
          const bytes = await exportEditedPdf(editor.session, editor.snapshot);
          const result = await convertRemotely(new File([bytes], `${name}.pdf`, { type: 'application/pdf' }), 'docx', { ocr: wordMode === 'ocr' });
          downloadBlob(result, `${name}-${wordMode === 'ocr' ? 'ocr' : 'enhanced'}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else {
          const result = wordMode === 'visual'
            ? await pdfToVisualDocx(editor.session, editor.snapshot)
            : await pdfToDocx(editor.session, editor.snapshot);
          downloadBlob(result, `${name}${wordMode === 'visual' ? '-visual' : '-text'}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        }
      } else if (utility === 'pdf-to-xlsx' || utility === 'pdf-to-pptx') {
        const target = utility === 'pdf-to-xlsx' ? 'xlsx' : 'pptx';
        if (!consent) throw new Error('Please confirm server processing first.');
        if (!serverFeatures?.[`pdf_to_${target}`]) throw new Error(`The optional PDF-to-${target.toUpperCase()} converter is not installed.`);
        const bytes = await exportEditedPdf(editor.session, editor.snapshot);
        const result = await convertRemotely(new File([bytes], `${name}.pdf`, { type: 'application/pdf' }), target);
        downloadBlob(result, `${name}.${target}`,
          target === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      } else if (utility === 'pdf-to-html') {
        downloadBlob(await (htmlMode === 'visual' ? pdfToVisualHtml(editor.session, editor.snapshot) : pdfToHtml(editor.session, editor.snapshot)), `${name}${htmlMode === 'visual' ? '-visual' : '-text'}.html`, 'text/html;charset=utf-8');
      } else if (utility === 'pdf-to-json') {
        downloadBlob(await pdfToJson(editor.session, editor.snapshot), `${name}.json`, 'application/json;charset=utf-8');
      } else if (utility === 'pdf-to-markdown') {
        downloadBlob(await pdfToMarkdown(editor.session, editor.snapshot), `${name}.md`, 'text/markdown;charset=utf-8');
      } else if (utility === 'pdf-to-epub') {
        downloadBlob(await pdfToEpub(editor.session, editor.snapshot), `${name}.epub`, 'application/epub+zip');
      } else if (utility === 'pdf-to-jpg' || utility === 'pdf-to-png' || utility === 'pdf-to-webp') {
        const kind = utility === 'pdf-to-jpg' ? 'jpeg' : utility === 'pdf-to-webp' ? 'webp' : 'png';
        const numbers = imageRange.trim().toLowerCase() === 'all'
          ? Array.from({ length: count }, (_, n) => n + 1)
          : parseRanges(imageRange, count);
        if (!numbers.length) throw new Error('Enter valid image page numbers, for example 1,3-5 or all.');
        const output = await documentToImages(editor.session, editor.snapshot, kind, { dpi: imageDpi, quality: imageQuality, pageNumbers: numbers });
        downloadBlob(output.data, output.zipped ? `${name}-${kind}-pages.zip` : `${name}-page-${numbers[0]}.${kind === 'jpeg' ? 'jpg' : kind}`, output.zipped ? 'application/zip' : `image/${kind}`);
      }
      onClose();
    } catch (error) { editor.notify(`Operation failed: ${readableError(error)}`); }
    finally { setWorking(false); }
  };

  const titles: Record<NonNullable<Utility>, string> = {
    merge: 'Merge PDFs', split: 'Extract pages', 'pdf-to-png': 'PDF to PNG',
    'pdf-to-jpg': 'PDF to JPG', 'pdf-to-webp': 'PDF to WebP',
    'pdf-to-text': 'PDF to text', 'pdf-to-docx': 'PDF to Word',
    'pdf-to-html': 'PDF to HTML (text)', 'pdf-to-json': 'PDF to JSON',
    'pdf-to-markdown': 'PDF to Markdown', 'pdf-to-epub': 'PDF to EPUB (text)',
    'pdf-to-xlsx': 'PDF to Excel tables', 'pdf-to-pptx': 'PDF to PowerPoint slides',
  };
  return <Dialog open={!!utility} onOpenChange={value => { if (!value && !working) onClose(); }}><DialogContent><div className="dialog-heading"><DialogTitle>{utility ? titles[utility] : 'Document tool'}</DialogTitle><DialogDescription>{utility === 'merge' ? 'Append additional PDF files to your current document.' : utility === 'split' ? 'Select which pages to download as a new PDF.' : 'Choose an export method. Browser tools stay local; enhanced conversions explicitly require a server.'}</DialogDescription></div>
    {utility === 'merge' && <div className="dialog-form"><label>Add PDF files<input type="file" multiple accept=".pdf,application/pdf" onChange={event => setFiles(Array.from(event.target.files || []))} /></label><p>{files.length} additional file(s) selected</p></div>}
    {utility === 'split' && <div className="dialog-form"><label>Page numbers or range<input value={pages} onChange={event => setPages(event.target.value)} placeholder="1,3-5" /></label><small>Current document: {count} pages. Separate ranges with commas.</small></div>}
    {(utility === 'pdf-to-png' || utility === 'pdf-to-jpg' || utility === 'pdf-to-webp') && <div className="dialog-form conversion-settings">
      <label>Pages to convert<input value={imageRange} onChange={event => setImageRange(event.target.value)} placeholder="all or 1,3-5" /></label>
      <label>Image resolution<select value={imageDpi} onChange={event => setImageDpi(Number(event.target.value))}><option value={96}>96 DPI · small</option><option value={144}>144 DPI · standard</option><option value={200}>200 DPI · sharp</option><option value={300}>300 DPI · print quality</option></select></label>
      {utility !== 'pdf-to-png' && <label>Image quality<select value={imageQuality} onChange={event => setImageQuality(Number(event.target.value))}><option value={.75}>Smaller file</option><option value={.9}>Balanced</option><option value={.98}>Maximum</option></select></label>}
      <p className="operation-note">One page downloads as a single image; multiple pages download as ZIP. Higher DPI uses more memory.</p>
    </div>}
    {utility === 'pdf-to-docx' && <div className="dialog-form conversion-settings">
      <label>Choose your Word output<select value={wordMode} onChange={event => setWordMode(event.target.value as 'editable' | 'visual' | 'enhanced' | 'ocr')}>
        <option value="editable">Editable text · local</option>
        <option value="visual">Preserve appearance · local</option>
        <option value="enhanced">Reconstruct layout · server</option>
        <option value="ocr">Scanned PDF to editable text · OCR server</option>
      </select></label>
      <p className="operation-note">{wordMode === 'editable' ? 'Text is editable, but original PDF graphics, tables and positioning may be lost. Scans need OCR.' : wordMode === 'visual' ? 'Visually resembles the PDF using page images. Text inside the Word document will not be editable.' : wordMode === 'ocr' ? (serverFeatures?.pdf_to_ocr_docx ? 'OCR is available for English scans. Page layout and fonts are not preserved.' : 'OCR needs the optional server with Tesseract installed.') : serverFeatures?.pdf_to_docx ? 'Enhanced conversion is available; complex pages and fonts may still differ.' : 'Enhanced Word conversion requires the optional server and pdf2docx engine.'}</p>
    </div>}
    {(utility === 'pdf-to-xlsx' || utility === 'pdf-to-pptx') && <p className="operation-note">{utility === 'pdf-to-xlsx' ? 'Extract detected tables into editable Excel cells (including many borderless tables). Scans and formulas may not convert.' : 'Turn PDF pages into slides that look like the original. Slide contents are images, not editable PowerPoint text and shapes.'} {serverFeatures?.[utility === 'pdf-to-xlsx' ? 'pdf_to_xlsx' : 'pdf_to_pptx'] ? 'Server converter is available.' : 'Requires a configured optional conversion server.'}</p>}
    {(utility === 'pdf-to-xlsx' || utility === 'pdf-to-pptx' || (utility === 'pdf-to-docx' && (wordMode === 'enhanced' || wordMode === 'ocr'))) && <label className="conversion-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I agree to send this PDF to the configured conversion server for processing.</label>}
    {utility === 'pdf-to-html' && <div className="dialog-form conversion-settings"><label>HTML output type<select value={htmlMode} onChange={event => setHtmlMode(event.target.value as 'visual' | 'text')}><option value="visual">Preserve visual pages · embedded images</option><option value="text">Readable, editable text layout</option></select></label><p className="operation-note">{htmlMode === 'visual' ? 'Appearance is preserved as images in a standalone HTML file. Extracted text appears in expandable panels; the visual content cannot be edited as HTML text.' : 'Text-only HTML is easy to edit but does not preserve the original graphics and layout.'}</p></div>}
    {utility === 'pdf-to-epub' && <p className="operation-note">Creates a reflowable ebook from selectable text. PDF images and original page layout are not preserved.</p>}
    {utility === 'pdf-to-markdown' && <p className="operation-note">Exports text as Markdown with page headings; it cannot reconstruct original headings or tables.</p>}
    {utility === 'pdf-to-json' && <p className="operation-note">Exports structured text grouped by page and line.</p>}
    {utility === 'pdf-to-text' && <p className="operation-note">Selectable text can be extracted; scanned-image PDFs require OCR, which is not included.</p>}
    <div className="dialog-footer"><Button variant="outline" onClick={onClose} disabled={working}>Cancel</Button><Button disabled={working || ((utility === 'pdf-to-xlsx' || utility === 'pdf-to-pptx' || (utility === 'pdf-to-docx' && (wordMode === 'enhanced' || wordMode === 'ocr'))) && !consent)} onClick={run}>{working ? 'Processing…' : utility === 'merge' ? 'Merge files' : 'Download result'} <ArrowRight size={15} /></Button></div>
  </DialogContent></Dialog>;
}
