import React, { useEffect, useRef } from 'react';
import type { PdfElement, TextRegion } from '@/types/editor';

export type InlineTextTarget =
  | { kind: 'existing'; region: TextRegion }
  | { kind: 'element'; pageId: string; element: PdfElement }
  | null;

export interface InlineTextDraft {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  background: string;
  align: 'left' | 'center' | 'right';
}

export function draftFromTarget(target: NonNullable<InlineTextTarget>): InlineTextDraft {
  const source = target.kind === 'existing' ? target.region : target.element;
  return {
    text: source.text || '',
    fontSize: Math.round(source.fontSize || 16),
    fontFamily: source.fontFamily || 'Arial',
    bold: Boolean(source.bold),
    italic: Boolean(source.italic),
    underline: 'underline' in source ? Boolean(source.underline) : false,
    color: target.kind === 'element' ? target.element.color : '#000000',
    background: target.kind === 'element' ? target.element.background || '#ffffff' : '#ffffff',
    align: target.kind === 'element' ? target.element.align || 'left' : 'left',
  };
}

/** An actual editable HTML textarea located on the PDF canvas, not a modal dialog. */
export function InlineTextEditor({ target, draft, pageWidth, update, commit, cancel }: {
  target: NonNullable<InlineTextTarget>;
  draft: InlineTextDraft;
  pageWidth: number;
  update(changes: Partial<InlineTextDraft>): void;
  commit(): void;
  cancel(): void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const source = target.kind === 'existing' ? target.region : target.element;
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.setSelectionRange(0, node.value.length);
  }, [source.id]);
  const lines = Math.max(1, draft.text.split(/\r?\n/).length);
  const width = Math.max(40, Math.min(pageWidth - source.x, Math.max(source.width + 12, draft.fontSize * Math.min(65, draft.text.length) * .52 + 16)));
  const height = Math.max(source.height + 7, draft.fontSize * 1.38 * lines + 11);

  return <foreignObject
    x={source.x - 2} y={source.y - 3} width={Math.max(45, width + 5)} height={height + 8}
    className="inline-text-foreign-object" style={{ overflow: 'visible' }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
  >
    <textarea
      ref={textareaRef}
      className="inline-pdf-textarea"
      aria-label="Edit PDF text directly on the page"
      spellCheck={false}
      maxLength={4000}
      value={draft.text}
      onChange={event => update({ text: event.target.value })}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); cancel(); }
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); }
      }}
      style={{
        color: draft.color, background: draft.background, fontFamily: draft.fontFamily,
        fontSize: draft.fontSize, fontWeight: draft.bold ? 700 : 400,
        fontStyle: draft.italic ? 'italic' : 'normal',
        textDecoration: draft.underline ? 'underline' : 'none',
        textAlign: draft.align, lineHeight: 1.18,
      }}
    />
  </foreignObject>;
}
