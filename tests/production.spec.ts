/** Browser-level release contract for the PDF engine. Not a substitute for manual cross-device QA. */
import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { expectDocumentReady } from './diagnostics';

async function fixturePdf(text = 'Before correction'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText(text, { x: 72, y: 720, size: 16, font });
  page.drawText('Keep this other heading', { x: 72, y: 675, size: 14, font });
  return Buffer.from(await doc.save());
}

async function readText(pdfBytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdf = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
  try {
    const content: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const items = (await page.getTextContent()).items;
      content.push(items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    return { pages: pdf.numPages, text: content.join('\n') };
  } finally {
    await pdf.destroy();
  }
}

test('existing PDF text is edited directly and old content is not searchable after export', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
    name: 'correction.pdf', mimeType: 'application/pdf', buffer: await fixturePdf(),
  });
  await expectDocumentReady(page, 'correction.pdf');
  const hitbox = page.locator('.native-text-hitbox').first();
  await expect(hitbox).toBeVisible({ timeout: 25_000 });
  await hitbox.click();
  const textarea = page.getByRole('textbox', { name: 'Edit PDF text directly on the page' });
  await expect(textarea).toBeVisible();
  await textarea.fill('After correction');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('correction-paprify.pdf');
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const bytes = await readFile(filePath!);
  const output = await readText(new Uint8Array(bytes));
  expect(output.pages).toBe(1);
  expect(output.text).toContain('After correction');
  expect(output.text).not.toContain('Before correction');
  // The rest of the reconstructed page is deliberately rasterized.
  expect(output.text).not.toContain('Keep this other heading');
});

test('two documents merge into a valid two-page PDF', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Organize PDF' }).click();
  await page.getByRole('button', { name: /Merge PDF/ }).click();
  await page.locator('input[type="file"][multiple][accept="application/pdf,.pdf"]').setInputFiles([
    { name: 'one.pdf', mimeType: 'application/pdf', buffer: await fixturePdf('One') },
    { name: 'two.pdf', mimeType: 'application/pdf', buffer: await fixturePdf('Two') },
  ]);
  await expectDocumentReady(page, 'Merged.pdf');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  const bytes = await readFile((await download.path())!);
  const output = await readText(new Uint8Array(bytes));
  expect(output.pages).toBe(2);
  expect(output.text).toContain('One');
  expect(output.text).toContain('Two');
});

test('invalid PDF is rejected without entering the workspace', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
    name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Not a PDF'),
  });
  await expect(page.getByRole('status')).toContainText('Could not open PDF');
  await expect(page.getByRole('heading', { name: 'Everything you need to work with PDFs.' })).toBeVisible();
});
