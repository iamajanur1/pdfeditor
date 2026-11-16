import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { expectDocumentReady } from './diagnostics';

const onePage = async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 600]).drawText('Conversion example', { x: 50, y: 540, size: 18, font });
  return Buffer.from(await pdf.save());
};

test('image to A4 PDF preserves the requested paper size', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Convert to PDF' }).click();
  await page.getByRole('button', { name: /PNG to PDF/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Images to PDF')).toBeVisible();
  await dialog.locator('input[type=file]').setInputFiles('tests/fixtures/sample.png');
  await dialog.getByLabel('Page size').selectOption('a4');
  await dialog.getByLabel('Orientation').selectOption('portrait');
  await dialog.getByRole('button', { name: /Create PDF/ }).click();
  await expectDocumentReady(page, 'sample.pdf');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  const output = await PDFDocument.load(await readFile((await download.path())!));
  expect(output.getPageCount()).toBe(1);
  const { width, height } = output.getPage(0).getSize();
  expect(width).toBeCloseTo(595.28, 1);
  expect(height).toBeCloseTo(841.89, 1);
});

test('PDF to PNG of one page downloads a PNG, not an unnecessary ZIP', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Convert from PDF' }).click();
  await page.getByRole('button', { name: /PDF to PNG/ }).click();
  await page.locator('input[type=file][accept="application/pdf,.pdf"]').last().setInputFiles({
    name: 'convert.pdf', mimeType: 'application/pdf', buffer: await onePage(),
  });
  await expectDocumentReady(page, 'convert.pdf');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Pages to convert').fill('1');
  await dialog.getByLabel('Image resolution').selectOption('144');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Download result/ }).click()]);
  expect(download.suggestedFilename()).toBe('convert-page-1.png');
  const output = await readFile((await download.path())!);
  expect(output.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
});

test('Office conversion displays explicit server upload consent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Convert to PDF' }).click();
  await page.getByRole('button', { name: /Word to PDF/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('I agree to upload this file', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Create PDF/ })).toBeDisabled();
});
