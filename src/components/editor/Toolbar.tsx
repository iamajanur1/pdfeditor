import React, { useMemo } from 'react';
import {
  Check, ChevronDown, Circle, Eraser, FileImage, Files, Hand, Highlighter, ImagePlus,
  Layers, MessageSquareText, Minus, MousePointer2, PenLine, Plus, RectangleHorizontal,
  Shapes, Square, Stamp, Type, Undo2, Redo2, X, Signature, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { usePdfEditor } from '@/hooks/usePdfEditor';
import type { Tool, PdfElement } from '@/types/editor';

interface ToolbarProps {
  showPages: boolean;
  onTogglePages(): void;
  onImage(): void;
  onSignature(): void;
  onStamps(): void;
  onManagePages(): void;
  onEditSelected(): void;
}

function ToolButton({ icon: Icon, label, active, onClick, disabled = false }: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick(): void;
  disabled?: boolean;
}) {
  return <button title={label} className={`editor-tool ${active ? 'editor-tool-active' : ''}`} onClick={onClick} disabled={disabled}>
    <Icon size={19} strokeWidth={1.7} /><span>{label}</span>
  </button>;
}

export function Toolbar({ showPages, onTogglePages, onImage, onSignature, onStamps, onManagePages, onEditSelected }: ToolbarProps) {
  const editor = usePdfEditor();
  const tool = editor.tool;
  const choose = (value: Tool) => { editor.setTool(value); editor.select(null); };
  const shapes: { tool: Tool; name: string; icon: typeof Square }[] = [
    { tool: 'rectangle', name: 'Rectangle', icon: Square },
    { tool: 'ellipse', name: 'Ellipse', icon: Circle },
    { tool: 'line', name: 'Line', icon: Minus },
    { tool: 'arrow', name: 'Arrow', icon: Hand },
    { tool: 'polygon', name: 'Polygon', icon: Shapes },
    { tool: 'cloud', name: 'Cloud', icon: RectangleHorizontal },
    { tool: 'polyline', name: 'Polyline', icon: PenLine },
  ];

  return <div className="editor-toolbar" role="toolbar" aria-label="PDF editing tools">
    <div className="toolbar-scroll">
      <ToolButton icon={Files} label="Pages" active={showPages} onClick={onTogglePages} />
      <div className="toolbar-divider" />
      <ToolButton icon={MousePointer2} label="Select" active={tool === 'select'} onClick={() => choose('select')} />
      <ToolButton icon={Type} label="Edit text" active={tool === 'edit-text'} onClick={() => { if (editor.selected) onEditSelected(); else choose('edit-text'); }} />
      <ToolButton icon={Plus} label="Add text" active={tool === 'text'} onClick={() => choose('text')} />
      <ToolButton icon={Eraser} label="Eraser" active={tool === 'erase'} onClick={() => choose('erase')} />
      <ToolButton icon={Highlighter} label="Highlight" active={tool === 'highlight'} onClick={() => choose('highlight')} />
      <ToolButton icon={PenLine} label="Draw" active={tool === 'draw'} onClick={() => choose('draw')} />
      <ToolButton icon={ImagePlus} label="Image" onClick={onImage} active={tool === 'image'} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={`editor-tool ${shapes.some(shape => shape.tool === tool) ? 'editor-tool-active' : ''}`}><Shapes size={19} strokeWidth={1.7} /><span>Shapes <ChevronDown size={10} /></span></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {shapes.map(({ tool: shape, name, icon: Icon }) => <DropdownMenuItem key={shape} onSelect={() => choose(shape)}><Icon size={16} />{name}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolButton icon={X} label="Cross" active={tool === 'cross'} onClick={() => choose('cross')} />
      <ToolButton icon={Check} label="Check" active={tool === 'check'} onClick={() => choose('check')} />
      <ToolButton icon={Signature} label="Sign" onClick={onSignature} />
      <ToolButton icon={Stamp} label="Stamp" onClick={onStamps} active={tool === 'stamp'} />
      <ToolButton icon={MessageSquareText} label="Note" onClick={() => choose('note')} active={tool === 'note'} />
      <div className="toolbar-divider" />
      <ToolButton icon={Layers} label="Manage pages" onClick={onManagePages} />
    </div>
  </div>;
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange(color: string): void }) {
  return <label className="property-color" title={label}><input aria-label={label} type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={event => onChange(event.target.value)} /><span>{label}</span></label>;
}

export function PropertiesBar({ onEditSelected }: { onEditSelected(): void }) {
  const editor = usePdfEditor();
  const selection = editor.selected;
  const item = selection?.kind === 'element'
    ? editor.snapshot.elements[selection.pageId]?.find(value => value.id === selection.elementId)
    : undefined;
  const isText = item?.type === 'text' || item?.type === 'replacement' || item?.type === 'stamp' || selection?.kind === 'existing' || editor.tool === 'text' || editor.tool === 'edit-text';
  const isDraw = ['draw', 'highlight', 'rectangle', 'ellipse', 'line', 'arrow', 'polygon', 'cloud', 'polyline'].includes(editor.tool);
  const hasSettings = item || selection?.kind === 'existing' || isDraw || isText;
  const actual = selection?.kind === 'existing' ? selection.region : item;
  const textSize = actual?.fontSize || editor.defaults.fontSize;
  const textFamily = actual?.fontFamily || editor.defaults.fontFamily;
  const color = item?.color || editor.defaults.color;
  const isExisting = selection?.kind === 'existing';

  const updateValue = (changes: Partial<PdfElement>) => {
    if (selection?.kind === 'element') editor.updateElement(selection.pageId, selection.elementId, changes);
    else if (!isExisting) editor.setDefaults(changes);
  };

  if (!hasSettings) return <div className="properties-bar properties-empty"><span>Choose a tool or select an element to see its settings.</span></div>;

  return <div className="properties-bar" role="toolbar" aria-label="Selected tool properties">
    <div className="properties-scroll">
      {isExisting ? <span className="property-hint">Detected text · approximate font</span> : null}
      {isText ? <>
        <select className="property-select property-font" aria-label="Font family" value={textFamily} onChange={event => updateValue({ fontFamily: event.target.value })} disabled={isExisting}>
          {!['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].includes(textFamily) && <option value={textFamily}>{textFamily}</option>}
          <option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Courier New">Courier New</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option>
        </select>
        <label className="property-size"><input type="number" min={5} max={200} value={Math.round(textSize)} aria-label="Font size in points" onChange={event => updateValue({ fontSize: Math.max(5, Math.min(200, Number(event.target.value))) })} disabled={isExisting} /><span>pt</span></label>
        <div className="property-group">
          <button disabled={isExisting} title="Bold" aria-pressed={Boolean(item?.bold ?? editor.defaults.bold)} className={item?.bold ?? editor.defaults.bold ? 'property-active' : ''} onClick={() => updateValue({ bold: !(item?.bold ?? editor.defaults.bold) })}><b>B</b></button>
          <button disabled={isExisting} title="Italic" aria-pressed={Boolean(item?.italic ?? editor.defaults.italic)} className={item?.italic ?? editor.defaults.italic ? 'property-active' : ''} onClick={() => updateValue({ italic: !(item?.italic ?? editor.defaults.italic) })}><i>I</i></button>
          <button disabled={isExisting} title="Underline" aria-pressed={Boolean(item?.underline ?? editor.defaults.underline)} className={item?.underline ?? editor.defaults.underline ? 'property-active' : ''} onClick={() => updateValue({ underline: !(item?.underline ?? editor.defaults.underline) })}><u>U</u></button>
        </div>
        <div className="property-group">
          {(['left', 'center', 'right'] as const).map(align => <button key={align} title={`Align ${align}`} disabled={isExisting} aria-pressed={(item?.align || editor.defaults.align) === align} className={(item?.align || editor.defaults.align) === align ? 'property-active' : ''} onClick={() => updateValue({ align })}>{align === 'left' ? '≡' : align === 'center' ? '☷' : '≣'}</button>)}
        </div>
        {isExisting && <Button size="sm" onClick={onEditSelected}>Edit selected text</Button>}
      </> : null}
      {(!isExisting && (item || isDraw || isText)) && <ColourInput label="Colour" value={color} onChange={value => updateValue({ color: value })} />}
      {item && ['rectangle', 'ellipse', 'polygon', 'cloud'].includes(item.type) || ['rectangle', 'ellipse', 'polygon', 'cloud'].includes(editor.tool) ?
        <ColourInput label="Fill" value={item?.fill || editor.defaults.fill} onChange={value => updateValue({ fill: value })} /> : null}
      {item && !['text', 'replacement', 'image', 'signature', 'note', 'stamp'].includes(item.type) || isDraw ?
        <label className="property-range">Thickness <input type="number" aria-label="Stroke thickness" min={1} max={30} value={item?.strokeWidth || editor.defaults.strokeWidth} onChange={event => updateValue({ strokeWidth: Math.max(1, Math.min(30, Number(event.target.value))) })} /> px</label> : null}
      {!isExisting && <div className="property-opacity"><span>Opacity</span><Slider min={5} max={100} step={5} value={[Math.round((item?.opacity ?? editor.defaults.opacity) * 100)]} onValueChange={value => updateValue({ opacity: value[0] / 100 })} /><span>{Math.round((item?.opacity ?? editor.defaults.opacity) * 100)}%</span></div>}
      {selection?.kind === 'element' && <button className="property-delete" aria-label="Delete selected element" title="Delete selected element" onClick={() => editor.removeElement(selection.pageId, selection.elementId)}><Trash2 size={18} /></button>}
    </div>
  </div>;
}
