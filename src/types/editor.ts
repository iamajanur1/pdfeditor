import type { PDFDocumentProxy } from 'pdfjs-dist';

export type Tool = 'select' | 'edit-text' | 'text' | 'highlight' | 'draw' | 'erase' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'cloud' | 'polyline' | 'cross' | 'check' | 'stamp' | 'note' | 'image' | 'signature';

export type ElementType = 'text' | 'replacement' | 'highlight' | 'drawing' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'polygon' | 'cloud' | 'polyline' | 'cross' | 'check' | 'stamp' | 'note' | 'image' | 'signature';
export type Point = [number, number];

export interface PageModel {
  id: string;
  sourceIndex: number | null;
  width: number;
  height: number;
  rotation: number;
}

export interface PdfElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  originalText?: string;
  /** Original text glyph area to clear independently of the replacement text width. */
  coverWidth?: number;
  coverHeight?: number;
  textRegionId?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color: string;
  fill?: string;
  background?: string;
  opacity: number;
  strokeWidth: number;
  rotation?: number;
  points?: Point[];
  dataUrl?: string;
}

export interface TextRegion {
  id: string;
  pageId: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
}

export interface EditorSnapshot {
  pages: PageModel[];
  elements: Record<string, PdfElement[]>;
  fields: Record<string, string | boolean>;
}

export type Selection =
  | { kind: 'element'; pageId: string; elementId: string }
  | { kind: 'existing'; pageId: string; region: TextRegion }
  | null;

export interface DocumentSession {
  name: string;
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  originalPageCount: number;
}

export interface EditorDefaults {
  color: string;
  fill: string;
  opacity: number;
  strokeWidth: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  stamp: string;
}

export interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'other';
  value: string | boolean;
  options?: string[];
}
