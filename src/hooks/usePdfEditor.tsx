import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  DocumentSession, EditorDefaults, EditorSnapshot, PageModel, PdfElement, Selection, Tool,
} from '@/types/editor';
import { readableError, uid } from '@/lib/utils';

interface EditorContextValue {
  session: DocumentSession | null;
  snapshot: EditorSnapshot;
  selected: Selection;
  tool: Tool;
  defaults: EditorDefaults;
  busy: string | null;
  toast: string;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  open(file: File): Promise<void>;
  loadBytes(bytes: Uint8Array, filename: string): Promise<void>;
  createBlank(): Promise<void>;
  close(): void;
  transact(updater: (before: EditorSnapshot) => EditorSnapshot): void;
  addElement(pageId: string, value: PdfElement): void;
  updateElement(pageId: string, elementId: string, updates: Partial<PdfElement>): void;
  removeElement(pageId: string, elementId: string): void;
  duplicateElement(pageId: string, elementId: string): void;
  select(value: Selection): void;
  setTool(value: Tool): void;
  setDefaults(updates: Partial<EditorDefaults>): void;
  rotatePage(pageId: string, delta: number): void;
  movePage(pageId: string, delta: number): void;
  duplicatePage(pageId: string): void;
  deletePage(pageId: string): void;
  insertPage(index: number): void;
  setField(name: string, value: string | boolean): void;
  undo(): void;
  redo(): void;
  exportFile(): Promise<void>;
  notify(message: string): void;
  setBusy(message: string | null): void;
}

const defaults: EditorDefaults = {
  color: '#18324b',
  fill: 'transparent',
  opacity: 1,
  strokeWidth: 2.5,
  fontFamily: 'Arial',
  fontSize: 18,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  stamp: 'APPROVED',
};

const emptySnapshot = (): EditorSnapshot => ({ pages: [], elements: {}, fields: {} });
const clone = (value: EditorSnapshot): EditorSnapshot => structuredClone(value);
const EditorContext = createContext<EditorContextValue | null>(null);

export function PdfEditorProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<DocumentSession | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() => emptySnapshot());
  const [selected, setSelected] = useState<Selection>(null);
  const [tool, setActiveTool] = useState<Tool>('select');
  const [settings, setSettings] = useState<EditorDefaults>(defaults);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [historyStatus, setHistoryStatus] = useState({ undo: 0, redo: 0 });
  const [dirty, setDirty] = useState(false);
  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // A short-lived success toast is fine; errors must remain visible until
    // dismissed so users and automated tests can diagnose failed PDF loads.
    const isError = /^(Could not|Merge failed:|Conversion failed:|Export failed:|Cannot |Failed to )/i.test(message);
    if (message && !isError) toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const resetEditor = useCallback((value: EditorSnapshot) => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryStatus({ undo: 0, redo: 0 });
    setSelected(null);
    setActiveTool('select');
    setDirty(false);
    setSnapshot(value);
  }, []);

  const loadBytes = useCallback(async (bytes: Uint8Array, filename: string) => {
    setBusy('Opening PDF…');
    try {
      const { openPdfBytes } = await import('@/lib/pdf');
      const result = await openPdfBytes(bytes, filename);
      setSession(previous => {
        if (previous) void previous.pdf.destroy().catch(() => {});
        return result.session;
      });
      resetEditor({ pages: result.pages, elements: {}, fields: {} });
      notify(`Opened ${filename}`);
    } catch (error) {
      notify(`Could not open PDF: ${readableError(error)}`);
      throw error;
    } finally {
      setBusy(null);
    }
  }, [notify, resetEditor]);

  const open = useCallback(async (file: File) => {
    setBusy('Opening PDF…');
    try {
      const { openPdf } = await import('@/lib/pdf');
      const result = await openPdf(file);
      setSession(previous => {
        if (previous) void previous.pdf.destroy().catch(() => {});
        return result.session;
      });
      resetEditor({ pages: result.pages, elements: {}, fields: {} });
      notify(`Opened ${file.name}`);
    } catch (error) {
      notify(`Could not open PDF: ${readableError(error)}`);
      throw error;
    } finally {
      setBusy(null);
    }
  }, [notify, resetEditor]);

  const createBlank = useCallback(async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    await loadBytes(new Uint8Array(await doc.save()), 'Untitled.pdf');
  }, [loadBytes]);

  const close = useCallback(() => {
    setSession(previous => {
      if (previous) void previous.pdf.destroy().catch(() => {});
      return null;
    });
    resetEditor(emptySnapshot());
  }, [resetEditor]);

  const transact = useCallback((updater: (before: EditorSnapshot) => EditorSnapshot) => {
    setSnapshot(previous => {
      const next = updater(previous);
      if (next === previous) return previous;
      undoStack.current.push(clone(previous));
      if (undoStack.current.length > 80) undoStack.current.shift();
      redoStack.current = [];
      setDirty(true);
      setHistoryStatus({ undo: undoStack.current.length, redo: 0 });
      return next;
    });
  }, []);

  const addElement = useCallback((pageId: string, value: PdfElement) => {
    transact(previous => ({
      ...previous,
      elements: { ...previous.elements, [pageId]: [...(previous.elements[pageId] || []), value] },
    }));
    setSelected({ kind: 'element', pageId, elementId: value.id });
  }, [transact]);

  const updateElement = useCallback((pageId: string, elementId: string, updates: Partial<PdfElement>) => {
    transact(previous => ({
      ...previous,
      elements: {
        ...previous.elements,
        [pageId]: (previous.elements[pageId] || []).map(item => item.id === elementId ? { ...item, ...updates } : item),
      },
    }));
  }, [transact]);

  const removeElement = useCallback((pageId: string, elementId: string) => {
    transact(previous => ({
      ...previous,
      elements: { ...previous.elements, [pageId]: (previous.elements[pageId] || []).filter(item => item.id !== elementId) },
    }));
    setSelected(null);
  }, [transact]);

  const duplicateElement = useCallback((pageId: string, elementId: string) => {
    const source = snapshot.elements[pageId]?.find(e => e.id === elementId);
    if (!source) return;
    addElement(pageId, { ...structuredClone(source), id: uid('element'), x: source.x + 12, y: source.y + 12 });
  }, [addElement, snapshot.elements]);

  const setDefaults = useCallback((updates: Partial<EditorDefaults>) => {
    setSettings(previous => ({ ...previous, ...updates }));
  }, []);

  const rotatePage = useCallback((pageId: string, delta: number) => {
    transact(previous => ({
      ...previous,
      pages: previous.pages.map(page => page.id === pageId ? { ...page, rotation: ((page.rotation + delta) % 360 + 360) % 360 } : page),
    }));
  }, [transact]);

  const movePage = useCallback((pageId: string, delta: number) => {
    transact(previous => {
      const pages = previous.pages.slice();
      const from = pages.findIndex(page => page.id === pageId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= pages.length) return previous;
      [pages[from], pages[to]] = [pages[to], pages[from]];
      return { ...previous, pages };
    });
  }, [transact]);

  const duplicatePage = useCallback((pageId: string) => {
    transact(previous => {
      const pages = previous.pages.slice();
      const index = pages.findIndex(page => page.id === pageId);
      if (index < 0) return previous;
      const newId = uid('page');
      pages.splice(index + 1, 0, { ...pages[index], id: newId });
      return {
        ...previous,
        pages,
        elements: {
          ...previous.elements,
          [newId]: (previous.elements[pageId] || []).map(element => ({ ...structuredClone(element), id: uid('element') })),
        },
      };
    });
  }, [transact]);

  const deletePage = useCallback((pageId: string) => {
    transact(previous => {
      if (previous.pages.length < 2) {
        notify('A PDF needs at least one page.');
        return previous;
      }
      const elements = { ...previous.elements };
      delete elements[pageId];
      return { ...previous, pages: previous.pages.filter(page => page.id !== pageId), elements };
    });
    setSelected(null);
  }, [notify, transact]);

  const insertPage = useCallback((index: number) => {
    transact(previous => {
      const pages = previous.pages.slice();
      pages.splice(index, 0, { id: uid('page'), sourceIndex: null, width: 595.28, height: 841.89, rotation: 0 });
      return { ...previous, pages };
    });
  }, [transact]);

  const setField = useCallback((name: string, value: string | boolean) => {
    transact(previous => ({ ...previous, fields: { ...previous.fields, [name]: value } }));
  }, [transact]);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setSnapshot(current => {
      redoStack.current.push(clone(current));
      return previous;
    });
    setSelected(null);
    setDirty(true);
    setHistoryStatus({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setSnapshot(current => {
      undoStack.current.push(clone(current));
      return next;
    });
    setSelected(null);
    setDirty(true);
    setHistoryStatus({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const exportFile = useCallback(async () => {
    if (!session) return;
    setBusy('Preparing your PDF…');
    try {
      const { downloadBlob, exportEditedPdf } = await import('@/lib/pdf');
      const bytes = await exportEditedPdf(session, snapshot);
      downloadBlob(bytes, session.name.replace(/\.pdf$/i, '') + '-paprify.pdf');
      setDirty(false);
      notify('PDF exported successfully.');
    } catch (error) {
      notify(`Export failed: ${readableError(error)}`);
    } finally {
      setBusy(null);
    }
  }, [session, snapshot, notify]);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!session || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session, dirty]);

  const value: EditorContextValue = {
    session, snapshot, selected, tool, defaults: settings, busy, toast,
    canUndo: historyStatus.undo > 0, canRedo: historyStatus.redo > 0, dirty,
    open, loadBytes, createBlank, close, transact, addElement, updateElement,
    removeElement, duplicateElement, select: setSelected, setTool: setActiveTool,
    setDefaults, rotatePage, movePage, duplicatePage, deletePage, insertPage,
    setField, undo, redo, exportFile, notify, setBusy,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function usePdfEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('usePdfEditor must be used inside PdfEditorProvider.');
  return value;
}
