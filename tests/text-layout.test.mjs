import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPdfTextLines, wrapPdfParagraph, standardPdfFontFamily } from '../src/lib/textLayout.ts';

test('replacement text never breaks an original word', () => {
  assert.deepEqual(splitPdfTextLines('After correction'), ['After correction']);
  assert.deepEqual(splitPdfTextLines('New line\r\nWith text'), ['New line', 'With text']);
  assert.deepEqual(splitPdfTextLines('Final\rline'), ['Final', 'line']);
});

test('text-to-PDF wrapping is based on measured glyph width', () => {
  const width = text => [...text].reduce((w, letter) => w + (letter === 'W' ? 11 : 4), 0);
  assert.deepEqual(wrapPdfParagraph('WWWW', 22, width), ['WW', 'WW']);
  assert.deepEqual(wrapPdfParagraph('iiii', 22, width), ['iiii']);
  assert.deepEqual(wrapPdfParagraph('', 10, width), ['']);
});

test('unicode code points are not split into invalid surrogate halves', () => {
  const lines = wrapPdfParagraph('😀😀😀', 2, s => [...s].length);
  assert.deepEqual(lines, ['😀😀', '😀']);
});

test('font mapping never treats sans-serif as Times Roman', () => {
  assert.equal(standardPdfFontFamily('sans-serif'), 'Helvetica');
  assert.equal(standardPdfFontFamily('Arial'), 'Helvetica');
  assert.equal(standardPdfFontFamily('Georgia'), 'TimesRoman');
  assert.equal(standardPdfFontFamily('Times New Roman'), 'TimesRoman');
  assert.equal(standardPdfFontFamily('Courier New'), 'Courier');
});
