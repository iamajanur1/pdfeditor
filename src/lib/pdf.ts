/**
 * Browser-only document services. No files leave the device.
 * pdf-lib writes annotations; PDF.js reads and renders original document content.
 */
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, degrees, rgb, LineCapStyle, PDFName, PDFString } from 'pdf-lib';
import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentSession, EditorSnapshot, FormFieldInfo, PdfElement, PageModel, Point } from '@/types/editor';
import { safeHex, uid } from '@/lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PAGES = 600;
const MAX_COMBINED_BYTES = 150 * 1024 * 1024;

function assertPdfBytes(bytes: Uint8Array) {
  if (!bytes.length) throw new Error('The selected PDF is empty.');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Maximum PDF size is 100 MB.');
  // PDF headers normally begin at byte zero; readers may allow a short prefix.
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, Math.min(1024, bytes.length)));
  if (!header.includes('%PDF-')) throw new Error('This file does not contain a valid PDF header.');
}

const hexColor = (value: string) => {
  const hex = safeHex(value);
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
};

export async function openPdf(file: File): Promise<{ session: DocumentSession; pages: PageModel[] }> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Maximum file size is 100 MB. Large PDFs may also exceed mobile device memory.');
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('Select a PDF file. Use the Image to PDF tool for JPG or PNG files.');
  }
  return openPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export async function openPdfBytes(bytes: Uint8Array, name: string): Promise<{ session: DocumentSession; pages: PageModel[] }> {
  assertPdfBytes(bytes);
  const data = new Uint8Array(bytes);
  const loading = pdfjsLib.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const pdf = await loading.promise.catch(async (error: unknown) => {
    await loading.destroy().catch(() => {});
    throw error;
  });
  try {
    if (!pdf.numPages) throw new Error('The PDF contains no pages.');
    if (pdf.numPages > MAX_PAGES) throw new Error(`This browser workspace supports up to ${MAX_PAGES} pages per document. Split this document first.`);
    const pages: PageModel[] = [];
    for (let start = 1; start <= pdf.numPages; start += 6) {
      const count = Math.min(6, pdf.numPages - start + 1);
      const batch = await Promise.all(Array.from({ length: count }, (_, i) => pdf.getPage(start + i)));
      batch.forEach((original, i) => {
        const viewport = original.getViewport({ scale: 1, rotation: 0 });
        pages.push({ id: uid('page'), sourceIndex: start + i - 1, width: viewport.width, height: viewport.height, rotation: original.rotate || 0 });
      });
    }
    return { session: { name, bytes: data, pdf, originalPageCount: pdf.numPages }, pages };
  } catch (error) {
    await pdf.destroy().catch(() => {});
    throw error;
  }
}

export function toOutputPoint(point: Point, page: PageModel): Point {
  const [x, y] = point;
  switch ((page.rotation % 360 + 360) % 360) {
    case 90: return [y, page.height - x];
    case 180: return [page.width - x, page.height - y];
    case 270: return [page.width - y, x];
    default: return [x, y];
  }
}

export function fromOutputPoint(point: Point, page: PageModel): Point {
  const [x, y] = point;
  switch ((page.rotation % 360 + 360) % 360) {
    case 90: return [page.width - y, x];
    case 180: return [page.width - x, page.height - y];
    case 270: return [y, page.height - x];
    default: return [x, y];
  }
}

function docShapePath(kind: PdfElement['type'], width: number, height: number): string {
  if (kind === 'polygon') {
    return `M ${width * 0.25} 0 L ${width * 0.75} 0 L ${width} ${height * 0.5} L ${width * 0.75} ${height} L ${width * 0.25} ${height} L 0 ${height * 0.5} Z`;
  }
  if (kind === 'cloud') {
    const w = width;
    const h = height;
    return `M ${w * 0.2} ${h * 0.75} C ${-w * 0.08} ${h * 0.75} ${-w * 0.03} ${h * 0.25} ${w * 0.23} ${h * 0.26} C ${w * 0.3} ${-h * 0.08} ${w * 0.64} ${-h * 0.07} ${w * 0.73} ${h * 0.24} C ${w * 1.1} ${h * 0.19} ${w * 1.1} ${h * 0.78} ${w * 0.76} ${h * 0.79} Z`;
  }
  return '';
}

async function embedImage(document: PDFDocument, url: string) {
  const response = await fetch(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')) return document.embedJpg(bytes);
  return document.embedPng(bytes);
}

function wrapVisualText(text: string, maxWidth: number, fontSize: number): string[] {
  // Break long words as well as spaced text, avoiding oversized canvas allocations
  // in the Unicode fallback path. This is approximate, not full document layout.
  const charsPerLine = Math.max(1, Math.min(250, Math.floor(Math.max(20, maxWidth) / Math.max(3, fontSize * .54))));
  const result: string[] = [];
  for (const sourceLine of text.split(/\r?\n/)) {
    if (!sourceLine) { result.push(''); continue; }
    let remaining = sourceLine;
    while (remaining.length > charsPerLine) {
      const snippet = remaining.slice(0, charsPerLine + 1);
      const breakAt = snippet.lastIndexOf(' ');
      const take = breakAt > Math.floor(charsPerLine / 2) ? breakAt : charsPerLine;
      result.push(remaining.slice(0, take));
      remaining = remaining.slice(take).replace(/^ /, '');
    }
    result.push(remaining);
  }
  return result;
}

/** Render text as an image when a standard PDF font cannot represent its glyphs. */
async function textAsPng(text: string, element: PdfElement): Promise<string> {
  const scale = 2.5;
  const fontSize = element.fontSize || 16;
  const lines = text.split('\n');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.font = `${element.italic ? 'italic ' : ''}${element.bold ? 'bold ' : ''}${fontSize * scale}px ${element.fontFamily || 'sans-serif'}`;
  const maxWidth = Math.max(5, ...lines.map(line => context.measureText(line).width));
  canvas.width = Math.ceil(maxWidth + 8 * scale);
  canvas.height = Math.ceil(lines.length * fontSize * 1.25 * scale + 6 * scale);
  context.font = `${element.italic ? 'italic ' : ''}${element.bold ? 'bold ' : ''}${fontSize * scale}px ${element.fontFamily || 'sans-serif'}`;
  context.fillStyle = safeHex(element.color);
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, 2 * scale, (index * fontSize * 1.25 + 2) * scale));
  return canvas.toDataURL('image/png');
}

async function drawPdfElement(document: PDFDocument, pdfPage: ReturnType<PDFDocument['getPages']>[number], item: PdfElement, fontCache: Map<string, Awaited<ReturnType<PDFDocument['embedFont']>>>) {
  const H = pdfPage.getHeight();
  const x = item.x;
  const y = H - item.y - item.height;
  const width = Math.max(1, item.width);
  const height = Math.max(1, item.height);
  const color = hexColor(item.color);
  const opacity = item.opacity ?? 1;
  const strokeWidth = Math.max(0.3, item.strokeWidth || 2);

  if (item.type === 'image' || item.type === 'signature') {
    if (!item.dataUrl) return;
    const image = await embedImage(document, item.dataUrl);
    pdfPage.drawImage(image, { x, y, width, height, opacity });
    return;
  }

  if (item.type === 'highlight') {
    pdfPage.drawRectangle({ x, y, width, height, color, opacity: Math.min(0.6, opacity) });
    return;
  }

  if (item.type === 'drawing' || item.type === 'polyline') {
    const points = item.points || [];
    for (let index = 1; index < points.length; index++) {
      pdfPage.drawLine({
        start: { x: points[index - 1][0], y: H - points[index - 1][1] },
        end: { x: points[index][0], y: H - points[index][1] },
        thickness: strokeWidth,
        color,
        opacity,
        lineCap: LineCapStyle.Round,
      });
    }
    return;
  }

  if (item.type === 'rectangle' || item.type === 'cloud' || item.type === 'ellipse' || item.type === 'polygon') {
    const options = { borderColor: color, borderWidth: strokeWidth, color: item.fill && item.fill !== 'transparent' ? hexColor(item.fill) : undefined, opacity };
    if (item.type === 'ellipse') {
      pdfPage.drawEllipse({ x: x + width / 2, y: y + height / 2, xScale: width / 2, yScale: height / 2, ...options });
    } else if (item.type === 'rectangle') {
      pdfPage.drawRectangle({ x, y, width, height, ...options });
    } else {
      pdfPage.drawSvgPath(docShapePath(item.type, width, height), { x, y: y + height, ...options });
    }
    return;
  }

  if (item.type === 'line' || item.type === 'arrow') {
    pdfPage.drawLine({ start: { x: item.x, y: H - item.y }, end: { x: item.x + item.width, y: H - item.y - item.height }, color, thickness: strokeWidth, opacity });
    if (item.type === 'arrow') {
      const dx = item.width;
      const dy = -item.height;
      const angle = Math.atan2(dy, dx);
      const tipX = item.x + item.width;
      const tipY = H - item.y - item.height;
      for (const sign of [-1, 1]) {
        const heading = angle + sign * 0.55 + Math.PI;
        pdfPage.drawLine({ start: { x: tipX, y: tipY }, end: { x: tipX + 14 * Math.cos(heading), y: tipY + 14 * Math.sin(heading) }, thickness: strokeWidth, color, opacity });
      }
    }
    return;
  }

  if (item.type === 'cross' || item.type === 'check') {
    const points: Point[] = item.type === 'cross'
      ? [[0, 0], [1, 1], [1, 0], [0, 1]]
      : [[0, 0.5], [0.38, 0.88], [1, 0.05]];
    const segments: [Point, Point][] = item.type === 'cross' ? [[points[0], points[1]], [points[2], points[3]]] : [[points[0], points[1]], [points[1], points[2]]];
    for (const [p1, p2] of segments) {
      pdfPage.drawLine({ start: { x: x + p1[0] * width, y: H - (item.y + p1[1] * height) }, end: { x: x + p2[0] * width, y: H - (item.y + p2[1] * height) }, color, thickness: strokeWidth + 1.5, opacity, lineCap: LineCapStyle.Round });
    }
    return;
  }

  if (item.type === 'note') {
    // Preserve the note as a native PDF Text annotation so a reader can open its content.
    const context = document.context;
    const annotation = context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [x, y, x + 22, y + 22], Contents: PDFString.of(item.text || ''), Name: 'Comment', C: [1, 0.84, 0.22], Open: false });
    const ref = context.register(annotation);
    const annots = pdfPage.node.Annots();
    if (annots) annots.push(ref);
    else pdfPage.node.set(PDFName.of('Annots'), context.obj([ref]));
    return;
  }

  if (item.type === 'replacement') {
    // This is an appearance-layer replacement; the original PDF content stream remains below it.
    pdfPage.drawRectangle({ x, y: H - item.y - (item.coverHeight || item.height), width: item.coverWidth || width, height: item.coverHeight || height, color: hexColor(item.background || '#ffffff') });
  }

  if (item.type === 'stamp') {
    pdfPage.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: 2, opacity });
  }

  if (item.type === 'text' || item.type === 'replacement' || item.type === 'stamp') {
    const fontSize = Math.max(5, Math.min(180, item.fontSize || 16));
    const text = item.text || '';
    if (text.length > 4000) throw new Error('Text elements must be shorter than 4,000 characters.');
    const lines = wrapVisualText(text, width + (item.type === 'text' ? 400 : 0), fontSize);
    const family = (item.fontFamily || '').toLowerCase();
    const fontType = family.includes('courier') || family.includes('mono') ? 'Courier' : family.includes('times') || family.includes('serif') ? 'TimesRoman' : 'Helvetica';
    const fontKey = `${fontType}-${item.bold ? 'bold' : 'regular'}-${item.italic ? 'italic' : 'upright'}`;
    const style = fontType === 'Helvetica'
      ? item.bold ? (item.italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : (item.italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica)
      : fontType === 'Courier'
        ? item.bold ? (item.italic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold) : (item.italic ? StandardFonts.CourierOblique : StandardFonts.Courier)
        : item.bold ? (item.italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : (item.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman);
    const font = fontCache.get(fontKey) || await document.embedFont(style);
    fontCache.set(fontKey, font);
    const top = item.y + fontSize; // Match the SVG text baseline in CanvasPage.
    for (const [i, line] of lines.entries()) {
      if (!line) continue;
      const actualY = H - top - i * fontSize * 1.22;
      try {
        let offX = 0;
        if (item.align === 'center' || item.align === 'right') {
          const measured = font.widthOfTextAtSize(line, fontSize);
          offX = item.align === 'center' ? Math.max(0, (width - measured) / 2) : Math.max(0, width - measured);
        }
        pdfPage.drawText(line, { x: item.x + offX + (item.type === 'stamp' ? 5 : 0), y: actualY, size: fontSize, font, color, opacity });
        if (item.underline) {
          const measured = font.widthOfTextAtSize(line, fontSize);
          pdfPage.drawLine({ start: { x: item.x + offX, y: actualY - 2 }, end: { x: item.x + offX + measured, y: actualY - 2 }, color, thickness: 0.75 });
        }
      } catch {
        // Helvetica does not support arbitrary Unicode. Use the browser's glyph fallback.
        const png = await textAsPng(line, { ...item, fontSize });
        const image = await embedImage(document, png);
        pdfPage.drawImage(image, { x: item.x, y: actualY - fontSize * 0.24, width: image.width / 2.5, height: image.height / 2.5, opacity });
      }
    }
  }
}

/**
 * Render the original appearance of a page into a bounded bitmap, then clear
 * only the regions that the user has actually replaced. This is deliberate:
 * drawing an opaque white box over a copied PDF leaves old searchable text
 * intact underneath. Reconstructed pages no longer carry that source content.
 *
 * Trade-off: any existing text on reconstructed pages becomes image content;
 * Paprify-added replacement text remains selectable. This is NOT a secure
 * redaction service, nor native editing of an arbitrary embedded PDF font.
 */
async function reconstructPageBackground(pdf: import('pdfjs-dist').PDFDocumentProxy, model: PageModel, corrections: PdfElement[]): Promise<Uint8Array> {
  if (model.sourceIndex === null) throw new Error('Cannot reconstruct a blank page.');
  const sourcePage = await pdf.getPage(model.sourceIndex + 1);
  const maxDimension = Math.max(model.width, model.height);
  const scale = Math.min(2.25, 3200 / Math.max(1, maxDimension));
  const viewport = sourcePage.getViewport({ scale, rotation: 0 });
  const pixelCount = viewport.width * viewport.height;
  if (pixelCount > 16_000_000) throw new Error('This page is too large to reconstruct safely. Extract the page and try again.');
  const canvas = document.createElement('canvas');
  try {
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser cannot render the PDF for text editing.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await sourcePage.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
    for (const item of corrections) {
      // Physically remove the original pixels before embedding the background.
      // This avoids retaining the old text in the new page's PDF content stream.
      context.fillStyle = safeHex(item.background || '#ffffff');
      const left = Math.max(0, Math.floor((item.x - 0.4) * scale));
      const top = Math.max(0, Math.floor((item.y - 0.4) * scale));
      const right = Math.min(canvas.width, Math.ceil((item.x + (item.coverWidth || item.width) + 0.4) * scale));
      const bottom = Math.min(canvas.height, Math.ceil((item.y + (item.coverHeight || item.height) + 0.4) * scale));
      context.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    }
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value && value.type === 'image/jpeg'
        ? resolve(value) : reject(new Error('This browser cannot encode a reconstructed PDF page.')), 'image/jpeg', .94);
    });
    return new Uint8Array(await image.arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    sourcePage.cleanup();
  }
}

export async function exportEditedPdf(session: DocumentSession, snapshot: EditorSnapshot): Promise<Uint8Array> {
  if (!snapshot.pages.length) throw new Error('The document has no pages.');
  const source = await PDFDocument.load(new Uint8Array(session.bytes), { ignoreEncryption: false });
  // Apply interactive form values to the source, including flattened pages.
  if (Object.keys(snapshot.fields).length) {
    const form = source.getForm();
    for (const [name, value] of Object.entries(snapshot.fields)) {
      try {
        if (typeof value === 'boolean') {
          const box = form.getCheckBox(name);
          if (value) box.check(); else box.uncheck();
        } else {
          try { form.getTextField(name).setText(value); }
          catch { form.getDropdown(name).select(value); }
        }
      } catch { /* Unknown or unsupported form fields are left untouched. */ }
    }
    try { form.flatten(); } catch { /* Some malformed forms cannot be flattened. */ }
  }

  const requiresReconstruction = snapshot.pages.some(page =>
    page.sourceIndex !== null && (snapshot.elements[page.id] || []).some(item => item.type === 'replacement'));
  let temporaryPdf: import('pdfjs-dist').PDFDocumentProxy | null = null;
  // Form fills are applied in source PDF before rendering reconstructed pages.
  // Normal edits reuse the existing PDF.js document without a duplicate worker.
  let rasterPdf = session.pdf;
  if (requiresReconstruction && Object.keys(snapshot.fields).length) {
    const updatedSource = new Uint8Array(await source.save({ useObjectStreams: true }));
    const loading = pdfjsLib.getDocument({ data: new Uint8Array(updatedSource), useSystemFonts: true });
    temporaryPdf = await loading.promise;
    rasterPdf = temporaryPdf;
  }

  try {
    const output = await PDFDocument.create();
    const fontCache = new Map<string, Awaited<ReturnType<PDFDocument['embedFont']>>>();
    const untouched = snapshot.pages.filter(page => page.sourceIndex !== null &&
      !(snapshot.elements[page.id] || []).some(item => item.type === 'replacement'));
    const untouchedCopied = await output.copyPages(source, untouched.map(page => page.sourceIndex as number));
    let cursor = 0;
    for (const model of snapshot.pages) {
      const elements = snapshot.elements[model.id] || [];
      const replacements = elements.filter(item => item.type === 'replacement');
      let target: ReturnType<PDFDocument['addPage']>;
      if (model.sourceIndex === null) {
        target = output.addPage([model.width, model.height]);
      } else if (replacements.length) {
        const background = await reconstructPageBackground(rasterPdf, model, replacements);
        const bitmap = await output.embedJpg(background);
        target = output.addPage([model.width, model.height]);
        target.drawImage(bitmap, { x: 0, y: 0, width: model.width, height: model.height });
      } else {
        target = untouchedCopied[cursor++];
        output.addPage(target);
      }
      target.setRotation(degrees(model.rotation));
      for (const item of elements) await drawPdfElement(output, target, item, fontCache);
    }
    return new Uint8Array(await output.save({ useObjectStreams: true }));
  } finally {
    if (temporaryPdf) await temporaryPdf.destroy().catch(() => {});
  }
}

/** File merge shared by the landing tool and the in-editor utility. */
async function mergePdfSources(initial: Uint8Array | null, files: File[]): Promise<Uint8Array> {
  if (files.length > 25) throw new Error('Merge a maximum of 25 files at once.');
  const size = (initial?.byteLength || 0) + files.reduce((sum, file) => sum + file.size, 0);
  if (size > MAX_COMBINED_BYTES) throw new Error('Combined PDF input must be less than 150 MB.');
  const output = await PDFDocument.create();
  const all: (Uint8Array | File)[] = initial ? [initial, ...files] : files;
  let totalPages = 0;
  for (const item of all) {
    if (item instanceof File && item.size > MAX_FILE_BYTES) throw new Error(`${item.name} exceeds 100 MB.`);
    const bytes = item instanceof File ? new Uint8Array(await item.arrayBuffer()) : item;
    assertPdfBytes(bytes);
    const doc = await PDFDocument.load(new Uint8Array(bytes));
    totalPages += doc.getPageCount();
    if (totalPages > MAX_PAGES) throw new Error(`Merged documents cannot exceed ${MAX_PAGES} pages in this browser workspace.`);
    const copied = await output.copyPages(doc, doc.getPageIndices());
    copied.forEach(page => output.addPage(page));
  }
  if (!totalPages) throw new Error('Choose at least one valid PDF.');
  return new Uint8Array(await output.save({ useObjectStreams: true }));
}

export async function mergeDocuments(base: DocumentSession, additional: File[]): Promise<Uint8Array> {
  return mergePdfSources(base.bytes, additional);
}

export async function mergePdfFiles(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error('Choose at least two PDF files to merge.');
  return mergePdfSources(null, files);
}

/** Converts browser-supported PNG, JPG, WebP and BMP images into a PDF. */
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  if (!files.length) throw new Error('Choose at least one image.');
  if (files.length > 50) throw new Error('Choose at most 50 images per conversion.');
  if (files.some(file => file.size > 20 * 1024 * 1024)) throw new Error('Each image must be less than 20 MB.');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_COMBINED_BYTES) throw new Error('Combined image input must be less than 150 MB.');
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const detected = /\.bmp$/i.test(file.name) ? 'image/bmp' : file.type;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(detected)) throw new Error(`Unsupported image format: ${file.name}`);
    let bytes = new Uint8Array(await file.arrayBuffer());
    let type = detected;
    if (type === 'image/webp' || type === 'image/bmp') {
      const bitmap = await createImageBitmap(file);
      try {
        const shrink = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * shrink));
        canvas.height = Math.max(1, Math.round(bitmap.height * shrink));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image conversion is unavailable on this browser.');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cannot decode image.')), 'image/png'));
        bytes = new Uint8Array(await blob.arrayBuffer());
        type = 'image/png';
        canvas.width = canvas.height = 0;
      } finally { bitmap.close(); }
    }
    const img = type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const factor = Math.min(1, 1200 / Math.max(img.width, img.height));
    const width = img.width * factor;
    const height = img.height * factor;
    const page = pdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  return new Uint8Array(await pdf.save({ useObjectStreams: true }));
}

/** Create paginated, selectable text PDF where supported by standard fonts. */
export async function textToPdf(file: File): Promise<Uint8Array> {
  if (file.size > 3 * 1024 * 1024) throw new Error('TXT files larger than 3 MB are not supported.');
  const contents = (await file.text()).replace(/\r\n?/g, '\n');
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const pageWidth = 595.28, pageHeight = 841.89, margin = 45, lineHeight = 17;
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin - size;
  const newLine = () => {
    y -= lineHeight;
    if (y < margin) { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin - size; }
  };
  const maxWidth = pageWidth - margin * 2;
  for (const paragraph of contents.split('\n')) {
    if (!paragraph.length) { newLine(); continue; }
    // Safe character-level wrapping: never clip an unbroken URL or long word.
    let part = '';
    for (const character of paragraph) {
      const trial = part + character;
      if (part && trial.length * 6.1 > maxWidth) {
        await drawTextLine(page, part, margin, y, size, font, document);
        newLine();
        part = character;
      } else part = trial;
    }
    if (part) await drawTextLine(page, part, margin, y, size, font, document);
    newLine();
  }
  return new Uint8Array(await document.save({ useObjectStreams: true }));
}

async function drawTextLine(page: ReturnType<PDFDocument['addPage']>, value: string, x: number, y: number, size: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>, pdf: PDFDocument) {
  try { page.drawText(value, { x, y, size, font, color: rgb(.08, .12, .18) }); }
  catch {
    // Non-Latin Unicode can be displayed using browser font rendering, but isn't searchable in this fallback.
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot render Unicode text.');
    ctx.font = '24px sans-serif';
    canvas.width = Math.max(10, Math.ceil(ctx.measureText(value).width + 10));
    canvas.height = 35;
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#152335';
    ctx.textBaseline = 'top';
    ctx.fillText(value, 0, 3);
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    page.drawImage(image, { x, y: y - 3, width: canvas.width / 2.2, height: canvas.height / 2.2 });
    canvas.width = canvas.height = 0;
  }
}

export async function splitDocument(session: DocumentSession, snapshot: EditorSnapshot, pageNumbers: number[]): Promise<Uint8Array> {
  const all = await exportEditedPdf(session, snapshot);
  const original = await PDFDocument.load(new Uint8Array(all));
  const result = await PDFDocument.create();
  const indices = pageNumbers.filter(n => n >= 1 && n <= original.getPageCount()).map(n => n - 1);
  if (indices.length === 0) throw new Error('Select at least one valid page number.');
  const pages = await result.copyPages(original, indices);
  pages.forEach(page => result.addPage(page));
  return new Uint8Array(await result.save());
}

export async function documentToImages(session: DocumentSession, snapshot: EditorSnapshot, kind: 'png' | 'jpeg' | 'webp', scale = 1.5) {
  if (snapshot.pages.length > 200) throw new Error('Image conversion is limited to 200 pages at once to protect browser memory. Extract a smaller range first.');
  const bytes = await exportEditedPdf(session, snapshot);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const zip = new JSZip();
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      if (viewport.width * viewport.height > 25_000_000) throw new Error('This page is too large for reliable browser image conversion.');
      const canvas = document.createElement('canvas');
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a canvas.');
        if (kind === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: context, viewport }).promise;
        const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error(`${kind.toUpperCase()} conversion is unsupported by this browser.`)),
          `image/${kind}`, kind === 'jpeg' ? 0.86 : 0.88,
        ));
        if (output.type !== `image/${kind}`) throw new Error(`${kind.toUpperCase()} conversion is unsupported by this browser.`);
        zip.file(`page-${String(i).padStart(3, '0')}.${kind === 'jpeg' ? 'jpg' : kind}`, output);
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  } finally { await pdf.destroy().catch(() => {}); }
}

interface ExtractedPage { page: number; lines: string[]; }

/** Extract readable text in page order, including Paprify edits, without the covered original text. */
export async function extractDocumentText(session: DocumentSession, snapshot: EditorSnapshot): Promise<ExtractedPage[]> {
  const result: ExtractedPage[] = [];
  for (const [index, model] of snapshot.pages.entries()) {
    const parts: { x: number; y: number; value: string }[] = [];
    const elements = snapshot.elements[model.id] || [];
    const replaced = new Set(elements.filter(e => e.type === 'replacement' && e.textRegionId !== undefined).map(e => e.textRegionId));
    if (model.sourceIndex !== null) {
      const page = await session.pdf.getPage(model.sourceIndex + 1);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      content.items.forEach((item, i) => {
        if (!('str' in item) || !item.str.trim() || replaced.has(String(i))) return;
        const t = pdfjsLib.Util.transform(viewport.transform, item.transform);
        parts.push({ x: t[4], y: t[5], value: item.str });
      });
    }
    for (const element of elements) {
      if (!['text', 'replacement', 'stamp'].includes(element.type) || !element.text) continue;
      element.text.split('\n').forEach((line, i) => parts.push({ x: element.x, y: element.y + i * (element.fontSize || 16) * 1.22, value: line }));
    }
    parts.sort((a, b) => Math.abs(a.y - b.y) > 5 ? a.y - b.y : a.x - b.x);
    const lines: string[] = [];
    let lineY = -Infinity;
    for (const part of parts) {
      if (!lines.length || Math.abs(part.y - lineY) > 5) { lines.push(part.value); lineY = part.y; }
      else lines[lines.length - 1] += (lines[lines.length - 1].endsWith(' ') || part.value.startsWith(' ') ? '' : ' ') + part.value;
    }
    result.push({ page: index + 1, lines });
  }
  return result;
}

export async function pdfToText(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  const pages = await extractDocumentText(session, snapshot);
  return pages.map(page => `Page ${page.page}\n${page.lines.join('\n')}`).join('\n\n----\n\n');
}

const escapeXml = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Editable DOCX based on extracted text. Original layout, fonts and graphics aren't reproduced. */
export async function pdfToDocx(session: DocumentSession, snapshot: EditorSnapshot): Promise<Blob> {
  const pages = await extractDocumentText(session, snapshot);
  if (!pages.some(page => page.lines.some(line => line.trim()))) throw new Error('No selectable text found. OCR is needed for a scanned PDF.');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const paragraphs = pages.map((page, idx) => {
    const content = page.lines.map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
    return content + (idx < pages.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '');
  }).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Readable HTML with page-separated text; this is intentionally not a visual PDF-to-HTML clone. */
export async function pdfToHtml(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  const pages = await extractDocumentText(session, snapshot);
  const title = escapeXml(session.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;color:#172738}section{border-bottom:1px solid #e0e5eb;padding:16px 0 36px}p{margin:.25em 0;white-space:pre-wrap}@media print{section{break-after:page}}</style></head><body><h1>${title}</h1>${pages.map(page => `<section><h2>Page ${page.page}</h2>${page.lines.map(line => `<p>${escapeXml(line)}</p>`).join('')}</section>`).join('')}</body></html>`;
}

export async function pdfToJson(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  return JSON.stringify({ source: session.name, pages: await extractDocumentText(session, snapshot) }, null, 2);
}

/** Text-first Markdown representation of the current page order and Paprify edits. */
export async function pdfToMarkdown(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  const pages = await extractDocumentText(session, snapshot);
  return `# ${session.name.replace(/\.pdf$/i, '')}\n\n` + pages.map(page => `## Page ${page.page}\n\n${page.lines.join('\n\n')}`).join('\n\n---\n\n');
}

/** EPUB 3 containing reflowable, readable text. This does not preserve PDF graphics or layout. */
export async function pdfToEpub(session: DocumentSession, snapshot: EditorSnapshot): Promise<Blob> {
  const pages = await extractDocumentText(session, snapshot);
  if (!pages.some(page => page.lines.some(line => line.trim()))) throw new Error('No selectable text found. OCR is needed for a scanned PDF.');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const title = escapeXml(session.name.replace(/\.pdf$/i, ''));
  const nav = pages.map(page => `<li><a href="page-${page.page}.xhtml">Page ${page.page}</a></li>`).join('');
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav}</ol></nav></body></html>`);
  const items = pages.map(page => `<item id="p${page.page}" href="page-${page.page}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = pages.map(page => `<itemref idref="p${page.page}"/>`).join('');
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">paprify-${Date.now()}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`);
  for (const page of pages) {
    zip.file(`OEBPS/page-${page.page}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${page.page}</title><meta charset="utf-8"/><style>body{font:1em/1.65 sans-serif;margin:1em}p{white-space:pre-wrap;margin:.5em 0}</style></head><body><h1>Page ${page.page}</h1>${page.lines.map(line => `<p>${escapeXml(line)}</p>`).join('')}</body></html>`);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function getFormFields(session: DocumentSession): Promise<FormFieldInfo[]> {
  const pdf = await PDFDocument.load(new Uint8Array(session.bytes));
  try {
    const form = pdf.getForm();
    return form.getFields().map(field => {
      const name = field.getName();
      const typeName = field.constructor.name;
      if (typeName === 'PDFTextField') return { name, type: 'text' as const, value: (field as ReturnType<typeof form.getTextField>).getText() || '' };
      if (typeName === 'PDFCheckBox') return { name, type: 'checkbox' as const, value: (field as ReturnType<typeof form.getCheckBox>).isChecked() };
      if (typeName === 'PDFDropdown') return { name, type: 'dropdown' as const, value: (field as ReturnType<typeof form.getDropdown>).getSelected()[0] || '', options: (field as ReturnType<typeof form.getDropdown>).getOptions() };
      return { name, type: 'other' as const, value: '' };
    });
  } catch { return []; }
}

export function downloadBlob(data: Blob | Uint8Array | string, name: string, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
