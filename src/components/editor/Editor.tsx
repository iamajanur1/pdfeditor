import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Download, FileDown, FilePlus2, Files,
  FileText, ImagePlus, Layers3, Maximize2, Menu, Minus, Moon, Plus,
  Printer, RotateCcw, RotateCw, Scissors, Search, Share2, Sun,
  Undo2, Redo2, X,
} from 'lucide-react';
import { Brand } from '@/components/landing/Landing';
import { Toolbar, PropertiesBar } from '@/components/editor/Toolbar';
import { CanvasPage } from '@/components/editor/CanvasPage';
import { Thumbnails } from '@/components/editor/Thumbnails';
import { ManagePages } from '@/components/editor/ManagePages';
import {
  FormsDialog, NoteDialog, SignatureDialog, StampDialog,
  UtilityDialog, type Utility,
} from '@/components/editor/Dialogs';
import { Button } from '@/components/ui/button';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import { draftFromTarget, type InlineTextTarget, type InlineTextDraft } from '@/components/editor/InlineTextEditor';
import { uid } from '@/lib/utils';
import type { PdfElement, TextRegion } from '@/types/editor';
import type { UtilityAction } from '@/App';

interface EditorProps {
  initialAction: UtilityAction;
  isDark: boolean;
  onToggleTheme(): void;
  onClose(): void;
}

const MIN_ZOOM = .3;
const MAX_ZOOM = 3;

export function Editor({ initialAction, isDark, onToggleTheme, onClose }: EditorProps) {
  const editor = usePdfEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const [showPages, setShowPages] = useState(() => window.innerWidth > 1000);
  const [currentPageId, setCurrentPageId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [textTarget, setTextTarget] = useState<InlineTextTarget>(null);
  const [textDraft, setTextDraft] = useState<InlineTextDraft | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ pageId: string; element: PdfElement } | null>(null);
  const [utility, setUtility] = useState<Utility>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const pages = editor.snapshot.pages;
  const selected = editor.selected;
  const firstPageId = pages[0]?.id || '';
  const activePageId = pages.some(page => page.id === currentPageId) ? currentPageId : firstPageId;
  const activePage = pages.find(page => page.id === activePageId) || pages[0];
  const currentIndex = Math.max(0, pages.findIndex(page => page.id === activePageId));
  const selectedItem = selected?.kind === 'element'
    ? editor.snapshot.elements[selected.pageId]?.find(item => item.id === selected.elementId)
    : null;

  useEffect(() => {
    if (!activePageId && firstPageId) setCurrentPageId(firstPageId);
  }, [activePageId, firstPageId]);

  useEffect(() => {
    if (initialAction === 'organize' || initialAction === 'rotate') setManageOpen(true);
    else if (initialAction === 'sign') setSignatureOpen(true);
    else if (initialAction === 'forms') setFormsOpen(true);
    else if (initialAction === 'annotate') editor.setTool('highlight');
    else if (['split', 'pdf-to-png', 'pdf-to-jpg', 'pdf-to-webp', 'pdf-to-text', 'pdf-to-docx', 'pdf-to-html', 'pdf-to-json', 'pdf-to-markdown', 'pdf-to-epub'].includes(initialAction)) {
      setUtility(initialAction as Utility);
    }
    // Only on initial editor opening; the same action should not repeat after every rerender.
  }, [initialAction]);

  const fitPage = useCallback(() => {
    const host = scrollRef.current;
    const page = pages[0];
    if (!host || !page) return;
    const room = Math.max(240, host.clientWidth - (window.innerWidth < 720 ? 32 : 88));
    const pageWidth = page.rotation % 180 ? page.height : page.width;
    setZoom(Math.max(MIN_ZOOM, Math.min(1.35, room / pageWidth)));
  }, [pages]);

  useEffect(() => {
    if (!fit) return;
    const host = scrollRef.current;
    if (!host) return;
    const observer = new ResizeObserver(fitPage);
    observer.observe(host);
    fitPage();
    return () => observer.disconnect();
  }, [fit, fitPage, showPages]);

  const navigate = useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    scrollRef.current?.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (window.innerWidth < 768) setShowPages(false);
  }, []);

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    let nearest: { id: string; distance: number } | null = null;
    root.querySelectorAll<HTMLElement>('[data-page-id]').forEach(node => {
      const distance = Math.abs(node.getBoundingClientRect().top - root.getBoundingClientRect().top - 40);
      if (!nearest || distance < nearest.distance) nearest = { id: node.dataset.pageId || '', distance };
    });
    if (nearest && (nearest as { id: string }).id) setCurrentPageId((nearest as { id: string }).id);
  };

  const beginInline = (target: NonNullable<InlineTextTarget>) => {
    if (textTarget && textDraft) {
      const currentId = textTarget.kind === 'existing' ? textTarget.region.id : textTarget.element.id;
      const nextId = target.kind === 'existing' ? target.region.id : target.element.id;
      if (currentId === nextId && textTarget.kind === target.kind &&
          (textTarget.kind === 'existing' ? textTarget.region.pageId : textTarget.pageId) ===
          (target.kind === 'existing' ? target.region.pageId : target.pageId)) return;
      commitInline();
    }
    // Clicking PDF text should focus an editor directly over that text, never open a popup.
    setTextTarget(target);
    setTextDraft(draftFromTarget(target));
  };

  const commitInline = () => {
    if (!textTarget || !textDraft) return;
    const draft = textDraft;
    if (draft.text.length > 4000) { editor.notify('Text must be shorter than 4,000 characters.'); return; }
    if (textTarget.kind === 'existing') {
      const region = textTarget.region;
      const original = region.text;
      if (draft.text !== original || draft.bold !== region.bold || draft.italic !== region.italic ||
        draft.fontSize !== Math.round(region.fontSize) || draft.fontFamily !== region.fontFamily ||
        draft.color !== '#000000' || draft.background !== '#ffffff' || draft.underline || draft.align !== 'left') {
        const page = pages.find(item => item.id === region.pageId);
        const approxWidth = Math.max(region.width + 4, draft.text.split('\n').reduce((w, line) => Math.max(w, line.length * draft.fontSize * .49), 0) + 12);
        const item: PdfElement = {
          id: uid('element'), type: 'replacement',
          x: region.x, y: region.y,
          width: Math.max(8, Math.min(approxWidth, (page?.width || 595) - region.x)),
          coverWidth: region.width + 2, coverHeight: region.height + 3,
          height: Math.max(region.height + 3, draft.fontSize * 1.25 * Math.max(1, draft.text.split('\n').length)),
          text: draft.text, originalText: original, textRegionId: region.id,
          fontFamily: draft.fontFamily, fontSize: draft.fontSize,
          bold: draft.bold, italic: draft.italic, underline: draft.underline,
          align: draft.align, color: draft.color, background: draft.background,
          opacity: 1, strokeWidth: 1,
        };
        editor.addElement(region.pageId, item);
      }
    } else {
      editor.updateElement(textTarget.pageId, textTarget.element.id, {
        text: draft.text, fontSize: draft.fontSize, fontFamily: draft.fontFamily,
        bold: draft.bold, italic: draft.italic, underline: draft.underline,
        align: draft.align, color: draft.color, background: draft.background,
      });
    }
    editor.setTool('select');
    setTextTarget(null);
    setTextDraft(null);
  };

  useEffect(() => {
    setTextTarget(null);
    setTextDraft(null);
  }, [editor.session]);

  const cancelInline = () => {
    if (textTarget?.kind === 'element' && textTarget.element.type === 'text' && textTarget.element.text === 'Enter text') {
      editor.removeElement(textTarget.pageId, textTarget.element.id);
    }
    setTextTarget(null);
    setTextDraft(null);
  };

  const confirmDiscard = () => (!editor.dirty && !textDraft) || window.confirm('You have unsaved changes. Download the edited PDF before replacing or closing this document. Continue without saving?');

  useEffect(() => {
    if (!textDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [textDraft]);

  const printDocument = async () => {
    if (!editor.session) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) { editor.notify('Allow pop-ups to print, or download the PDF and print it.'); return; }
    try {
      editor.setBusy('Preparing print-ready PDF…');
      const { exportEditedPdf } = await import('@/lib/pdf');
      const bytes = await exportEditedPdf(editor.session, editor.snapshot);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      tab.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
      tab.close();
      editor.notify(`Could not prepare PDF for printing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally { editor.setBusy(null); }
  };

  const editSelected = () => {
    if (selected?.kind === 'existing') beginInline({ kind: 'existing', region: selected.region });
    else if (selected?.kind === 'element' && selectedItem && ['text', 'replacement', 'stamp'].includes(selectedItem.type)) {
      beginInline({ kind: 'element', pageId: selected.pageId, element: selectedItem });
    } else if (selected?.kind === 'element' && selectedItem?.type === 'note') {
      setNoteTarget({ pageId: selected.pageId, element: selectedItem });
    } else editor.setTool('edit-text');
  };

  const insertImage = async (files: FileList | null) => {
    const file = files?.[0];
    const page = activePage;
    if (!file || !page) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      editor.notify('Select a PNG or JPG image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      editor.notify('Image size must be below 15 MB.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.onload = () => {
      const width = Math.min(page.width * .55, 270);
      const height = width * image.height / image.width;
      const item: PdfElement = {
        id: uid('element'), type: 'image', dataUrl,
        x: (page.width - width) / 2, y: (page.height - height) / 2,
        width, height, color: '#12324f', opacity: 1, strokeWidth: 1,
      };
      editor.addElement(page.id, item);
      navigate(page.id);
      editor.setTool('select');
    };
    image.onerror = () => editor.notify('The image could not be opened.');
    image.src = dataUrl;
  };

  const changeZoom = (delta: number) => {
    setFit(false);
    setZoom(value => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((value + delta).toFixed(2)))));
  };

  const removeSelected = () => {
    if (selected?.kind === 'element') editor.removeElement(selected.pageId, selected.elementId);
  };

  const sideActions = [
    { icon: FileText, text: 'Edit', action: () => { editor.setTool('select'); setMobileMenu(false); } },
    { icon: Layers3, text: 'Organize', action: () => { setManageOpen(true); setMobileMenu(false); } },
    { icon: Files, text: 'Merge', action: () => { setUtility('merge'); setMobileMenu(false); } },
    { icon: Scissors, text: 'Split', action: () => { setUtility('split'); setMobileMenu(false); } },
    { icon: FileDown, text: 'Convert', action: () => { setUtility('pdf-to-png'); setMobileMenu(false); } },
    { icon: Check, text: 'Forms', action: () => { setFormsOpen(true); setMobileMenu(false); } },
  ];

  return <div className="editor-app">
    <header className="editor-header">
      <div className="editor-heading">
        <Button size="icon" variant="ghost" aria-label="Close editor" onClick={() => { if (confirmDiscard()) onClose(); }}><ArrowLeft size={19} /></Button>
        <Brand isDark={isDark} small />
        <div className="header-line" />
        <span className="document-name" title={editor.session?.name}>{editor.session?.name || 'Document.pdf'}</span>
        <span className="document-status">Editing locally</span>
      </div>
      <div className="editor-header-actions">
        <Button className="header-aux" variant="ghost" size="sm" onClick={() => setSearchOpen(value => !value)}><Search size={17}/><span>Find</span></Button>
        <Button className="header-aux" variant="ghost" size="sm" disabled={Boolean(textDraft)} title={textDraft ? "Apply or cancel the active text edit before printing" : "Open print-ready PDF"} onClick={() => { void printDocument(); }}><Printer size={17}/><span>Print</span></Button>
        <Button className="header-aux" variant="ghost" size="sm" onClick={() => openRef.current?.click()}><FilePlus2 size={17}/><span>Open</span></Button>
        <Button variant="ghost" size="icon" aria-label="Toggle appearance" onClick={onToggleTheme}>{isDark ? <Sun size={18}/> : <Moon size={18}/>}</Button>
        <Button className="export-button" size="sm" disabled={Boolean(textDraft)} title={textDraft ? "Apply or cancel the active text edit before downloading" : "Download PDF"} onClick={() => void editor.exportFile()}><Download size={17}/><span>Download</span></Button>
        <Button className="header-mobile-menu" size="icon" variant="ghost" aria-label="More tools" onClick={() => setMobileMenu(value => !value)}><Menu size={20}/></Button>
      </div>
    </header>

    <div className="editor-main">
      <aside className={`editor-services ${mobileMenu ? 'editor-services-open' : ''}`} aria-label="PDF utilities">
        {sideActions.map(({ icon: Icon, text, action }) => <button key={text} className={`service-action ${text === 'Edit' ? 'service-current' : ''}`} onClick={action}><Icon size={19} strokeWidth={1.8}/><span>{text}</span></button>)}
      </aside>
      <section className="editor-workspace">
        <div className="editor-controls">
          <div className="mobile-action-header"><span>Editing tools</span><div><Button variant="ghost" size="compact" title="Undo" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={17}/></Button><Button variant="ghost" size="compact" title="Redo" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={17}/></Button></div></div>
          <Toolbar
            showPages={showPages}
            onTogglePages={() => setShowPages(value => !value)}
            onImage={() => imageRef.current?.click()}
            onSignature={() => setSignatureOpen(true)}
            onStamps={() => setStampOpen(true)}
            onManagePages={() => setManageOpen(true)}
            onEditSelected={editSelected}
          />
          {textDraft ? <div className="inline-format-bar" role="toolbar" aria-label="Inline text formatting">
            <span className="inline-format-title" title={textTarget?.kind === 'existing' ? 'Edited pages are reconstructed on export. Other original text on those pages becomes image-based; this is not native font rewriting or secure redaction.' : undefined}>Editing on page{ textTarget?.kind === 'existing' ? ' · reconstructed page export' : '' }</span>
            <select aria-label="Text font" value={textDraft.fontFamily} onChange={event => setTextDraft(d => d && ({ ...d, fontFamily: event.target.value }))}>
              {!['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].includes(textDraft.fontFamily) && <option value={textDraft.fontFamily}>{textDraft.fontFamily}</option>}
              {['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <label className="inline-format-size"><input type="number" min={5} max={180} aria-label="Font size" value={textDraft.fontSize} onChange={event => setTextDraft(d => d && ({ ...d, fontSize: Math.max(5, Math.min(180, Number(event.target.value) || 5)) }))} />pt</label>
            <button title="Bold" aria-pressed={textDraft.bold} className={textDraft.bold ? 'inline-active' : ''} onClick={() => setTextDraft(d => d && ({ ...d, bold: !d.bold }))}><b>B</b></button>
            <button title="Italic" aria-pressed={textDraft.italic} className={textDraft.italic ? 'inline-active' : ''} onClick={() => setTextDraft(d => d && ({ ...d, italic: !d.italic }))}><i>I</i></button>
            <button title="Underline" aria-pressed={textDraft.underline} className={textDraft.underline ? 'inline-active' : ''} onClick={() => setTextDraft(d => d && ({ ...d, underline: !d.underline }))}><u>U</u></button>
            <label className="inline-color-label" title="Text colour">Text<input type="color" aria-label="Text colour" value={textDraft.color} onChange={event => setTextDraft(d => d && ({ ...d, color: event.target.value }))} /></label>
            {(textTarget?.kind === 'existing' || textTarget?.kind === 'element' && textTarget.element.type === 'replacement') && <label className="inline-color-label" title="Original text cover colour">Cover<input type="color" aria-label="Cover colour" value={textDraft.background} onChange={event => setTextDraft(d => d && ({ ...d, background: event.target.value }))} /></label>}
            <button onClick={cancelInline}>Cancel</button>
            <Button size="sm" onClick={commitInline}><Check size={14}/> Apply</Button>
          </div> : <PropertiesBar onEditSelected={editSelected} />}
        </div>
        <div className="work-area">
          {showPages && <div className="thumbnail-shell"><Thumbnails currentPageId={activePageId} onNavigate={navigate} onManage={() => setManageOpen(true)} onClose={() => setShowPages(false)}/></div>}
          <div className="document-scroll" ref={scrollRef} onScroll={onScroll}>
            {searchOpen && <div className="page-search"><Search size={16}/><input autoFocus placeholder="Page number" type="number" min={1} max={pages.length} value={pageSearch} onChange={event => setPageSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { const page = pages[Number(pageSearch) - 1]; if (page) navigate(page.id); } }}/><Button size="sm" onClick={() => { const page = pages[Number(pageSearch) - 1]; if (page) navigate(page.id); }}>Go</Button><Button size="icon" variant="ghost" onClick={() => setSearchOpen(false)}><X size={15}/></Button></div>}
            <div className="page-stack">
              {pages.map((page, index) => <CanvasPage
                key={page.id} page={page} pageNumber={index + 1} zoom={zoom}
                onEditElement={(pageId, item) => beginInline({ kind: 'element', pageId, element: item })}
                onEditExisting={region => beginInline({ kind: 'existing', region })}
                inlineTarget={textTarget} inlineDraft={textDraft}
                onInlineChange={changes => setTextDraft(d => d && ({ ...d, ...changes }))}
                onInlineCommit={commitInline} onInlineCancel={cancelInline}
                onEditNote={(pageId, element) => setNoteTarget({ pageId, element })}
              />)}
            </div>
          </div>
        </div>
        <footer className="editor-footer">
          <span className="editor-footer-info">Local processing · Edited text pages are reconstructed on export · Not for secure redaction</span>
          <div className="page-controls">
            <span>Page {currentIndex + 1} / {pages.length}</span>
            <Button variant="ghost" size="compact" disabled={currentIndex === 0} onClick={() => navigate(pages[currentIndex - 1].id)}><ChevronDown style={{ transform: 'rotate(180deg)' }} size={16}/></Button>
            <Button variant="ghost" size="compact" disabled={currentIndex >= pages.length - 1} onClick={() => navigate(pages[currentIndex + 1].id)}><ChevronDown size={16}/></Button>
            <span className="footer-divider"/>
            <Button size="compact" variant="ghost" aria-label="Zoom out" onClick={() => changeZoom(-.15)}><Minus size={16}/></Button>
            <button className="zoom-number" title="Fit page" onClick={() => { setFit(true); fitPage(); }}>{Math.round(zoom * 100)}%</button>
            <Button size="compact" variant="ghost" aria-label="Zoom in" onClick={() => changeZoom(.15)}><Plus size={16}/></Button>
          </div>
        </footer>
      </section>
    </div>

    {selected && !textDraft && <div className="selection-actions" role="toolbar" aria-label="Selected element actions">
      <span>{selected.kind === 'existing' ? 'Text selected' : selectedItem?.type || 'Element'}</span>
      <Button variant="ghost" size="sm" onClick={editSelected}>Edit</Button>
      {selected.kind === 'element' && <Button variant="ghost" size="sm" onClick={() => editor.duplicateElement(selected.pageId, selected.elementId)}>Duplicate</Button>}
      {selected.kind === 'element' && <Button variant="ghost" size="sm" className="danger" onClick={removeSelected}>Delete</Button>}
      <Button variant="ghost" size="compact" aria-label="Clear selection" onClick={() => editor.select(null)}><X size={16}/></Button>
    </div>}

    <input type="file" className="sr-only" ref={imageRef} accept="image/png,image/jpeg" onChange={event => { void insertImage(event.target.files); event.target.value = ''; }}/>
    <input type="file" className="sr-only" ref={openRef} accept=".pdf,application/pdf" onChange={event => { const file = event.target.files?.[0]; if (file && confirmDiscard()) void editor.open(file); event.target.value = ''; }}/>
    <NoteDialog target={noteTarget} onClose={() => setNoteTarget(null)}/>
    <StampDialog open={stampOpen} onClose={() => setStampOpen(false)}/>
    <SignatureDialog open={signatureOpen} onClose={() => setSignatureOpen(false)} pageId={activePageId}/>
    <FormsDialog open={formsOpen} onClose={() => setFormsOpen(false)}/>
    <ManagePages open={manageOpen} onOpenChange={setManageOpen}/>
    <UtilityDialog utility={utility} onClose={() => setUtility(null)}/>
  </div>;
}
