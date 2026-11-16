/**
 * Browser-only document services. No files leave the device.
 * pdf-lib writes annotations; PDF.js reads and renders original document content.
 */
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, StandardFonts, degrees, rgb, LineCapStyle, PDFName, PDFHexString, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';
import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentSession, EditorSnapshot, FormFieldInfo, PdfElement, PageModel, Point } from '@/types/editor';
import { safeHex, uid } from '@/lib/utils';
import { splitPdfTextLines, wrapPdfParagraph, standardPdfFontFamily } from '@/lib/textLayout';

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

/** Render text as an image when a standard PDF font cannot represent its glyphs. */
async function textAsPng(text: string, element: PdfElement): Promise<{ url: string; scale: number }> {
  const fontSize = element.fontSize || 16;
  const lines = splitPdfTextLines(text);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  const fontString = (scale: number) => `${element.italic ? 'italic ' : ''}${element.bold ? 'bold ' : ''}${fontSize * scale}px ${element.fontFamily || 'sans-serif'}`;
  context.font = fontString(2.5);
  const naturalWidth = Math.max(5, ...lines.map(line => context.measureText(line).width));
  // Browsers can crash or throw if the canvas for a long Unicode line is huge.
  const scale = 2.5 * Math.min(1, 8000 / naturalWidth, 4000 / (lines.length * fontSize * 1.25 * 2.5 + 15));
  context.font = fontString(scale);
  const maxWidth = Math.max(5, ...lines.map(line => context.measureText(line).width));
  canvas.width = Math.max(1, Math.ceil(maxWidth + 8 * scale));
  canvas.height = Math.max(1, Math.ceil(lines.length * fontSize * 1.25 * scale + 6 * scale));
  context.font = fontString(scale);
  context.fillStyle = safeHex(element.color);
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, 2 * scale, (index * fontSize * 1.25 + 2) * scale));
  return { url: canvas.toDataURL('image/png'), scale };
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
    const annotation = context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [x, y, x + 22, y + 22], Contents: PDFHexString.fromText(item.text || ''), Name: 'Comment', C: [1, 0.84, 0.22], Open: false });
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
    // SVG preview does not auto-wrap. Never split PDF text during export.
    const lines = splitPdfTextLines(text);
    const fontType = standardPdfFontFamily(item.fontFamily || '');
    const fontKey = `${fontType}-${item.bold ? 'bold' : 'regular'}-${item.italic ? 'italic' : 'upright'}`;
    const style = fontType === 'Helvetica'
      ? item.bold ? (item.italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : (item.italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica)
      : fontType === 'Courier'
        ? item.bold ? (item.italic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold) : (item.italic ? StandardFonts.CourierOblique : StandardFonts.Courier)
        : item.bold ? (item.italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : (item.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman);
    const font = fontCache.get(fontKey) || await document.embedFont(style);
    fontCache.set(fontKey, font);
    // The on-screen stamp is vertically centered; text/replacements use top baseline.
    const top = item.type === 'stamp' ? item.y + height / 2 + fontSize * 0.34 : item.y + fontSize;
    for (const [i, line] of lines.entries()) {
      if (!line) continue;
      const actualY = H - top - i * fontSize * 1.22;
      try {
        let offX = 0;
        if (item.type === 'stamp' || item.align === 'center' || item.align === 'right') {
          const measured = font.widthOfTextAtSize(line, fontSize);
          offX = item.type === 'stamp' || item.align === 'center'
            ? (width - measured) / 2
            : width - measured;
        }
        pdfPage.drawText(line, { x: item.x + offX, y: actualY, size: fontSize, font, color, opacity });
        if (item.underline) {
          const measured = font.widthOfTextAtSize(line, fontSize);
          pdfPage.drawLine({ start: { x: item.x + offX, y: actualY - 2 }, end: { x: item.x + offX + measured, y: actualY - 2 }, color, thickness: 0.75 });
        }
      } catch {
        // Helvetica does not support arbitrary Unicode. Use the browser's glyph fallback.
        const png = await textAsPng(line, { ...item, fontSize });
        const image = await embedImage(document, png.url);
        pdfPage.drawImage(image, { x: item.x, y: actualY - fontSize * 0.24, width: image.width / png.scale, height: image.height / png.scale, opacity });
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
          // PDF form controls have different setters. Preserve radio group edits.
          const field = form.getField(name);
          if (field instanceof PDFTextField) field.setText(value);
          else if (field instanceof PDFDropdown) field.select(value);
          else if (field instanceof PDFRadioGroup) field.select(value);
          else throw new Error('Unsupported form field type');
        }
      } catch (error) {
        // Never silently export the old field value after the user changes it.
        throw new Error(`Cannot apply form field "${name}": ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    try { form.flatten(); }
    catch (error) { throw new Error(`Cannot flatten the edited PDF form: ${error instanceof Error ? error.message : 'unknown error'}`); }
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

/** Options used by the image conversion panel, in standard PDF points (72pt/inch). */
export interface ImagePdfOptions {
  pageSize?: 'original' | 'a4' | 'letter';
  layout?: 'contain' | 'cover';
  margin?: number;
  orientation?: 'auto' | 'portrait' | 'landscape';
}

/** Combine photos into correctly sized pages without reducing original JPEG/PNG resolution. */
export async function imagesToPdf(files: File[], options: ImagePdfOptions = {}): Promise<Uint8Array> {
  if (!files.length) throw new Error('Choose at least one image.');
  if (files.length > 50) throw new Error('Choose at most 50 images per conversion.');
  if (files.some(file => file.size > 20 * 1024 * 1024)) throw new Error('Each image must be less than 20 MB.');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_COMBINED_BYTES) throw new Error('Combined image input must be less than 150 MB.');
  const pdf = await PDFDocument.create();
  const pageSize = options.pageSize || 'original';
  const margin = Math.max(0, Math.min(90, options.margin ?? 0));
  for (const file of files) {
    const detected = /\.bmp$/i.test(file.name) ? 'image/bmp' : /\.webp$/i.test(file.name) ? 'image/webp' : /\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : file.type;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/bmp'].includes(detected)) throw new Error(`Unsupported image format: ${file.name}`);
    let bytes = new Uint8Array(await file.arrayBuffer());
    let type = detected;
    if (type === 'image/webp' || type === 'image/bmp') {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 32_000_000) throw new Error(`${file.name} is too large to decode safely in this browser.`);
        const canvas = document.createElement('canvas');
        try {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Image conversion is unavailable on this browser.');
          ctx.drawImage(bitmap, 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cannot decode image.')), 'image/png'));
          bytes = new Uint8Array(await blob.arrayBuffer());
          type = 'image/png';
        } finally { canvas.width = canvas.height = 0; }
      } finally { bitmap.close(); }
    }
    const img = type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Images with no paper selection use 96dpi, capped to a standard max PDF dimension.
    const intrinsicScale = Math.min(.75, 14400 / Math.max(img.width, img.height));
    let width = img.width * intrinsicScale;
    let height = img.height * intrinsicScale;
    if (pageSize !== 'original') {
      const base = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
      const orientation = options.orientation || 'auto';
      const landscape = orientation === 'landscape' || (orientation === 'auto' && img.width > img.height);
      [width, height] = landscape ? [base[1], base[0]] : [base[0], base[1]];
    }
    const page = pdf.addPage([width, height]);
    const availableWidth = Math.max(1, width - margin * 2);
    const availableHeight = Math.max(1, height - margin * 2);
    const contain = Math.min(availableWidth / img.width, availableHeight / img.height);
    const cover = Math.max(availableWidth / img.width, availableHeight / img.height);
    const factor = (options.layout || 'contain') === 'cover' ? cover : contain;
    if (options.layout === 'cover' && margin > 0) {
      page.pushOperators(pushGraphicsState(), rectangle(margin, margin, availableWidth, availableHeight), clip(), endPath());
    }
    const dw = img.width * factor, dh = img.height * factor;
    page.drawImage(img, { x: (width - dw) / 2, y: (height - dh) / 2, width: dw, height: dh });
    if (options.layout === 'cover' && margin > 0) page.pushOperators(popGraphicsState());
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
    if (y < margin) {
      if (document.getPageCount() >= MAX_PAGES) throw new Error(`Text conversion is limited to ${MAX_PAGES} pages.`);
      page = document.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin - size;
    }
  };
  const maxWidth = pageWidth - margin * 2;
  // Use the same font metrics as the PDF output. Fixed characters-per-line
  // guesses clipped wide letters and split narrow text unnecessarily.
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  if (measuringContext) measuringContext.font = `${size}px Arial`;
  const measure = (value: string): number => {
    try { return font.widthOfTextAtSize(value, size); }
    catch { return measuringContext?.measureText(value).width ?? [...value].length * size; }
  };
  for (const paragraph of contents.split('\n')) {
    if (!paragraph) { newLine(); continue; }
    const lines = wrapPdfParagraph(paragraph, maxWidth, measure);
    for (const [index, line] of lines.entries()) {
      if (index) newLine();
      if (line) await drawTextLine(page, line, margin, y, size, font, document);
    }
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

export interface PdfImageOptions {
  dpi?: number;
  pageNumbers?: number[];
  quality?: number;
}

/** Render selected pages with selectable output quality. A single page downloads directly. */
export async function documentToImages(session: DocumentSession, snapshot: EditorSnapshot, kind: 'png' | 'jpeg' | 'webp', options: PdfImageOptions = {}): Promise<{ data: Blob; zipped: boolean }> {
  const selected = options.pageNumbers?.length ? [...new Set(options.pageNumbers)] : snapshot.pages.map((_, index) => index + 1);
  if (selected.length > 200) throw new Error('Image conversion is limited to 200 pages at once.');
  if (selected.some(n => !Number.isInteger(n) || n < 1 || n > snapshot.pages.length)) throw new Error('Invalid page number selected.');
  const dpi = Math.max(72, Math.min(300, options.dpi || 144));
  const scale = dpi / 72;
  const quality = Math.max(.1, Math.min(1, options.quality ?? .9));
  const bytes = await exportEditedPdf(session, snapshot);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const zip = new JSZip();
  try {
    let lastBlob: Blob | null = null;
    for (const i of selected) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      if (viewport.width * viewport.height > 30_000_000) throw new Error(`Page ${i} exceeds the safe image size at ${dpi} DPI. Choose a lower resolution.`);
      const canvas = document.createElement('canvas');
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a canvas.');
        if (kind === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: context, viewport }).promise;
        const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('Could not render this page as an image.')),
          `image/${kind}`, quality,
        ));
        if (output.type !== `image/${kind}`) throw new Error(`${kind.toUpperCase()} is unsupported by this browser.`);
        if (selected.length === 1) lastBlob = output;
        else zip.file(`page-${String(i).padStart(3, '0')}.${kind === 'jpeg' ? 'jpg' : kind}`, output);
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
    }
    return selected.length === 1
      ? { data: lastBlob!, zipped: false }
      : { data: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }), zipped: true };
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

/** Editable Word document with approximate PDF line spacing, indent and font sizes.
 * PDFs do not store Word paragraph/table semantics; complex layouts remain approximate.
 */
export async function pdfToDocx(session: DocumentSession, snapshot: EditorSnapshot): Promise<Blob> {
  const pages = await extractDocumentText(session, snapshot);
  if (!pages.some(page => page.lines.some(line => line.trim()))) throw new Error('No selectable text found. Try scanned-document OCR or visual Word instead.');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const allParagraphs: string[] = [];
  for (const [pageIndex, pageData] of pages.entries()) {
    const model = snapshot.pages[pageIndex];
    const fonts: { y: number; x: number; size: number; font: string }[] = [];
    if (model.sourceIndex !== null) {
      const source = await session.pdf.getPage(model.sourceIndex + 1);
      const viewport = source.getViewport({ scale: 1, rotation: 0 });
      const content = await source.getTextContent();
      content.items.forEach(item => {
        if (!('str' in item) || !item.str.trim()) return;
        const t = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const family = String(content.styles?.[item.fontName]?.fontFamily || 'Arial');
        fonts.push({ x: t[4], y: t[5], size: Math.max(6, Math.min(72, Math.hypot(t[2], t[3]) || item.height || 11)), font: family });
      });
    }
    const seenFonts = fonts.sort((a, b) => a.y - b.y || a.x - b.x);
    let lastY = 0;
    const firstFont = seenFonts[0];
    let fontPointer = 0;
    for (const [lineIndex, value] of pageData.lines.entries()) {
      let size = 11, indent = 0, before = 0, family = 'Arial';
      const region = seenFonts[fontPointer];
      if (region) {
        size = region.size;
        indent = Math.max(0, Math.min(9500, Math.round((region.x - 36) * 20)));
        family = /(?<!sans-)serif|times/i.test(region.font) ? 'Times New Roman' : /mono|courier/i.test(region.font) ? 'Courier New' : 'Arial';
        const previous = lastY || (firstFont?.y ?? region.y);
        before = Math.max(0, Math.min(800, Math.round((region.y - previous - size * 1.1) * 20)));
        lastY = region.y;
        const currentY = region.y;
        while (fontPointer < seenFonts.length && Math.abs(seenFonts[fontPointer].y - currentY) < size * .7) fontPointer++;
      }
      const xmlText = escapeXml(value);
      const lineBreak = pageIndex > 0 && lineIndex === 0 ? '<w:pageBreakBefore/>' : '';
      const props = `<w:pPr>${lineBreak}<w:ind w:left="${indent}"/><w:spacing w:before="${before}" w:after="0"/></w:pPr>`;
      const familyXml = escapeXml(family);
      allParagraphs.push(`<w:p>${props}<w:r><w:rPr><w:rFonts w:ascii="${familyXml}" w:hAnsi="${familyXml}"/><w:sz w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${xmlText}</w:t></w:r></w:p>`);
    }
    if (!pageData.lines.length && pageIndex > 0) allParagraphs.push('<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>');
  }
  const firstPage = snapshot.pages[0];
  const pageWidth = Math.min(31680, Math.max(1440, Math.round((firstPage?.width || 595.28) * 20)));
  const pageHeight = Math.min(31680, Math.max(1440, Math.round((firstPage?.height || 841.89) * 20)));
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${allParagraphs.join('')}<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Visual-fidelity Word: one sharp image per PDF page, not editable text. */
export async function pdfToVisualDocx(session: DocumentSession, snapshot: EditorSnapshot): Promise<Blob> {
  if (snapshot.pages.length > 35) throw new Error('Visual Word export supports up to 35 pages. Select fewer pages for large documents.');
  const bytes = await exportEditedPdf(session, snapshot);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const zip = new JSZip();
  const entries: string[] = [];
  const relationships: string[] = [];
  let firstWidth = 595.28, firstHeight = 841.89;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const rawViewport = page.getViewport({ scale: 1 });
      if (number === 1) { firstWidth = rawViewport.width; firstHeight = rawViewport.height; }
      const widthLimit = 1600 / rawViewport.width;
      const pixelLimit = Math.sqrt(5_000_000 / (rawViewport.width * rawViewport.height));
      const viewport = page.getViewport({ scale: Math.min(2, widthLimit, pixelLimit) });
      const canvas = document.createElement('canvas');
      let jpg: Blob | null = null;
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not initialize Word visual export.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        jpg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not render PDF page.')), 'image/jpeg', .91));
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      if (!jpg) throw new Error('Could not convert the PDF page to a Word image.');
      zip.file(`word/media/page${number}.jpg`, jpg);
      relationships.push(`<Relationship Id="rId${number}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${number}.jpg"/>`);
      const margin = 20;
      const factor = Math.min((firstWidth - margin * 2) / rawViewport.width, (firstHeight - margin * 2) / rawViewport.height);
      const cx = Math.max(1, Math.round(rawViewport.width * factor * 12700));
      const cy = Math.max(1, Math.round(rawViewport.height * factor * 12700));
      entries.push(`<w:p><w:pPr>${number > 1 ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${number}" name="PDF page ${number}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${number}" name="page${number}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${number}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    }
  } finally { await pdf.destroy().catch(() => {}); }
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOffice" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`);
  const w = Math.min(31680, Math.round(firstWidth * 20)), h = Math.min(31680, Math.round(firstHeight * 20));
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${entries.join('')}<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
}

/** Readable HTML with page-separated text; this is intentionally not a visual PDF-to-HTML clone. */
export async function pdfToHtml(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  const pages = await extractDocumentText(session, snapshot);
  const title = escapeXml(session.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;color:#172738}section{border-bottom:1px solid #e0e5eb;padding:16px 0 36px}p{margin:.25em 0;white-space:pre-wrap}@media print{section{break-after:page}}</style></head><body><h1>${title}</h1>${pages.map(page => `<section><h2>Page ${page.page}</h2>${page.lines.map(line => `<p>${escapeXml(line)}</p>`).join('')}</section>`).join('')}</body></html>`;
}

/** Self-contained visual HTML; raster images preserve appearance, not editable HTML layout. */
export async function pdfToVisualHtml(session: DocumentSession, snapshot: EditorSnapshot): Promise<string> {
  if (snapshot.pages.length > 30) throw new Error('Visual HTML export is limited to 30 pages per file.');
  const bytes = await exportEditedPdf(session, snapshot);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const textPages = await extractDocumentText(session, snapshot);
  const figures: string[] = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1.5 });
      if (viewport.width * viewport.height > 15_000_000) throw new Error('This PDF page is too large for a browser-based visual HTML export.');
      const canvas = document.createElement('canvas');
      let dataUrl = '';
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not render HTML page image.');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = canvas.toDataURL('image/jpeg', .88);
      } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      const pageText = escapeXml(textPages[number - 1]?.lines.join('\n') || '');
      figures.push(`<figure><img alt="PDF page ${number}" src="${dataUrl}" width="${Math.round(viewport.width)}" height="${Math.round(viewport.height)}"><figcaption>Page ${number}</figcaption><details><summary>View or copy extracted text</summary><pre>${pageText}</pre></details></figure>`);
    }
  } finally { await pdf.destroy().catch(() => {}); }
  const title = escapeXml(session.name.replace(/\.pdf$/i, ''));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;background:#eff2f6;color:#18283d;margin:0;padding:24px}main{max-width:980px;margin:auto}h1{font-size:24px;margin:0 0 18px}figure{margin:0 0 25px;background:#fff;box-shadow:0 5px 24px #17273825}img{width:100%;height:auto;display:block}figcaption{padding:10px 16px;font-size:13px}details{padding:0 16px 16px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{padding:0;background:#fff}h1,details,figcaption{display:none}figure{box-shadow:none;break-after:page;margin:0}img{max-height:100vh;object-fit:contain}}</style></head><body><main><h1>${title}</h1>${figures.join('')}</main></body></html>`;
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
      if (field instanceof PDFTextField) return { name, type: 'text' as const, value: field.getText() || '' };
      if (field instanceof PDFCheckBox) return { name, type: 'checkbox' as const, value: field.isChecked() };
      if (field instanceof PDFDropdown) return { name, type: 'dropdown' as const, value: field.getSelected()[0] || '', options: field.getOptions() };
      if (field instanceof PDFRadioGroup) return { name, type: 'radio' as const, value: field.getSelected() || '', options: field.getOptions() };
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
