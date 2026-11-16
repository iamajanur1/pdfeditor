import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { Landing } from '@/components/landing/Landing';
import { PdfEditorProvider, usePdfEditor } from '@/hooks/usePdfEditor';
import { readableError } from '@/lib/utils';
import './styles.css';

const Editor = lazy(() => import('@/components/editor/Editor').then(module => ({ default: module.Editor })));

export type UtilityAction =
  | 'edit' | 'sign' | 'annotate' | 'forms' | 'merge' | 'split' | 'organize' | 'rotate'
  | 'pdf-to-png' | 'pdf-to-jpg' | 'pdf-to-webp' | 'pdf-to-text' | 'pdf-to-docx' | 'pdf-to-html' | 'pdf-to-json' | 'pdf-to-markdown' | 'pdf-to-epub' | 'images-to-pdf' | 'text-to-pdf';

function Workspace() {
  const editor = usePdfEditor();
  const [initialAction, setInitialAction] = useState<UtilityAction>('edit');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('paprify-theme') === 'dark' ? 'dark' : 'light'));
  const openInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [requestedAction, setRequestedAction] = useState<UtilityAction>('edit');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('paprify-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(value => value === 'light' ? 'dark' : 'light');

  const openFile = useCallback(async (file: File, action: UtilityAction = 'edit') => {
    setInitialAction(action);
    try { await editor.open(file); }
    catch { /* Error toast displayed by provider. */ }
  }, [editor.open]);

  const handleImages = useCallback(async (files: File[]) => {
    if (!files.length) return;
    editor.setBusy('Creating your PDF…');
    try {
      const { imagesToPdf } = await import('@/lib/pdf');
      const bytes = await imagesToPdf(files);
      setInitialAction('edit');
      await editor.loadBytes(bytes, 'Images.pdf');
    } catch (error) { editor.notify(readableError(error)); }
    finally { editor.setBusy(null); }
  }, [editor.loadBytes, editor.notify, editor.setBusy]);

  const startTool = (action: UtilityAction) => {
    setRequestedAction(action);
    if (action === 'images-to-pdf') imageInputRef.current?.click();
    else if (action === 'text-to-pdf') textInputRef.current?.click();
    else if (action === 'merge') mergeInputRef.current?.click();
    else openInputRef.current?.click();
  };

  const openForAction = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void openFile(file, requestedAction);
  };

  // FileList is live: resetting an input clears it. Keep a stable File[] before
  // awaiting a dynamic module import, otherwise a valid merge sees zero files.
  const mergeFromFiles = async (files: File[]) => {
    if (files.length < 2) { editor.notify('Choose at least two PDF files to merge.'); return; }
    editor.setBusy('Merging PDFs…');
    try {
      const { mergePdfFiles } = await import('@/lib/pdf');
      const combined = await mergePdfFiles(files);
      await editor.loadBytes(combined, 'Merged.pdf');
      setInitialAction('edit');
    } catch (error) { editor.notify(`Merge failed: ${readableError(error)}`); }
    finally { editor.setBusy(null); }
  };

  const handleText = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    editor.setBusy('Converting text to PDF…');
    try {
      const { textToPdf } = await import('@/lib/pdf');
      const data = await textToPdf(file);
      setInitialAction('edit');
      await editor.loadBytes(data, file.name.replace(/\.txt$/i, '') + '.pdf');
    } catch (error) { editor.notify(`Conversion failed: ${readableError(error)}`); }
    finally { editor.setBusy(null); }
  };

  return (
    <>
      {!editor.session ? (
        <Landing
          isDark={theme === 'dark'}
          onToggleTheme={toggleTheme}
          onOpenFile={openFile}
          onTool={startTool}
          onImages={handleImages}
        />
      ) : (
        <Suspense fallback={<div className="global-loading"><LoaderCircle className="animate-spin" size={20} />Opening editor…</div>}><Editor initialAction={initialAction} isDark={theme === 'dark'} onToggleTheme={toggleTheme} onClose={editor.close} /></Suspense>
      )}
      <input ref={openInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={event => { openForAction(event.target.files); event.target.value = ''; }} />
      <input ref={mergeInputRef} type="file" multiple accept="application/pdf,.pdf" className="sr-only" onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void mergeFromFiles(files); }} />
      <input ref={imageInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/bmp,.bmp" className="sr-only" onChange={event => { void handleImages(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <input ref={textInputRef} type="file" accept=".txt,text/plain" className="sr-only" onChange={event => { void handleText(event.target.files); event.target.value = ''; }} />
      {editor.busy && <div className="global-loading"><LoaderCircle className="animate-spin" size={20} />{editor.busy}</div>}
      {editor.toast && <div role="status" className="toast-message">{editor.toast}<button aria-label="Dismiss notification" onClick={() => editor.notify('')}><X size={15} /></button></div>}
    </>
  );
}

export default function App() {
  return <PdfEditorProvider><Workspace /></PdfEditorProvider>;
}
