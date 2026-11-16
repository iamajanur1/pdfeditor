import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expectDocumentReady } from './diagnostics';

async function testPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText('Original sample text', { x: 72, y: 720, size: 16, font });
  return Buffer.from(await doc.save());
}

test('landing is usable and upload opens the real PDF editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Everything you need to work with PDFs.' })).toBeVisible();
  await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
    name: 'smoke.pdf', mimeType: 'application/pdf', buffer: await testPdf(),
  });
  await expectDocumentReady(page, 'smoke.pdf');
  await expect(page.locator('.native-text-hitbox').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.native-text-hitbox').first().click();
  const edit = page.getByRole('textbox', { name: 'Edit PDF text directly on the page' });
  await expect(edit).toBeVisible();
  await edit.fill('Edited sample text');
  await page.getByRole('button', { name: /Apply/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('smoke-paprify.pdf');
  expect(await download.failure()).toBeNull();
});

test('tools directory exposes working actions on mobile', async ({ page }) => {
  await page.goto('/');
  // The hidden native file input and visible dropzone have overlapping names.
  // Test the actual user-facing dropzone rather than an ambiguous role query.
  await expect(page.locator('.hero-dropzone')).toBeVisible();
  await page.getByRole('tab', { name: 'Convert from PDF' }).click();
  await expect(page.getByRole('button', { name: /PDF to Word/ })).toBeVisible();
});
