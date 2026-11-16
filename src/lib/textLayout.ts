/**
 * Shared text layout rules for the PDF preview and export path.
 * Preserve the user's explicit line breaks; PDF drawing never inserts
 * automatic breaks that were absent from the canvas preview.
 */
export function splitPdfTextLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Wrap text for a paginated document using measured glyph widths, not length heuristics. */
export function wrapPdfParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  if (!paragraph) return [''];
  const lines: string[] = [];
  let current = '';
  for (const character of paragraph) {
    const candidate = current + character;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

/** Resolve browser font names to the closest supported built-in PDF font. */
export function standardPdfFontFamily(fontFamily: string): 'Helvetica' | 'TimesRoman' | 'Courier' {
  const family = fontFamily.toLowerCase();
  if (family.includes('courier') || family.includes('mono')) return 'Courier';
  if (!family.includes('sans-serif') &&
      (family.includes('times') || family.includes('georgia') || family === 'serif')) return 'TimesRoman';
  return 'Helvetica';
}
