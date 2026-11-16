# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> existing PDF text is edited directly and old content is not searchable after export
- Location: tests/production.spec.ts:32:1

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: /Apply/ }) resolved to 2 elements:
    1) <button disabled title="Apply or cancel the active text edit before downloading" class="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs export-button">…</button> aka getByRole('button', { name: 'Apply or cancel the active' })
    2) <button class="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs">…</button> aka getByRole('button', { name: 'Apply', exact: true })

Call log:
  - waiting for getByRole('button', { name: /Apply/ })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - button "Close editor" [ref=e6] [cursor=pointer]
        - generic "Paprify" [ref=e9]:
          - img "Paprify" [ref=e10]
      - generic [ref=e11]:
        - button "Toggle appearance" [ref=e12] [cursor=pointer]
        - button "Apply or cancel the active text edit before downloading" [disabled]
        - button "More tools" [ref=e15] [cursor=pointer]
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]: Editing tools
          - generic [ref=e22]:
            - button "Undo" [disabled]
            - button "Redo" [disabled]
        - toolbar "PDF editing tools" [ref=e23]:
          - generic [ref=e24]:
            - button "Pages" [ref=e25] [cursor=pointer]
            - button "Select" [ref=e32] [cursor=pointer]
            - button "Edit text" [ref=e36] [cursor=pointer]
            - button "Add text" [ref=e40] [cursor=pointer]
            - button "Eraser" [ref=e43] [cursor=pointer]
            - button "Highlight" [ref=e48] [cursor=pointer]
            - button "Draw" [ref=e53] [cursor=pointer]
            - button "Image" [ref=e57] [cursor=pointer]
            - button "Shapes" [ref=e63] [cursor=pointer]
            - button "Cross" [ref=e71] [cursor=pointer]
            - button "Check" [ref=e76] [cursor=pointer]
            - button "Sign" [ref=e80] [cursor=pointer]
            - button "Stamp" [ref=e84] [cursor=pointer]
            - button "Note" [ref=e89] [cursor=pointer]
            - button "Manage pages" [ref=e94] [cursor=pointer]
        - toolbar "Inline text formatting" [ref=e100]:
          - combobox "Text font" [ref=e101]:
            - option "sans-serif" [selected]
            - option "Arial"
            - option "Times New Roman"
            - option "Courier New"
            - option "Georgia"
            - option "Verdana"
          - generic [ref=e102]:
            - spinbutton "Font size" [ref=e103]: "16"
            - text: pt
          - button "B" [ref=e104] [cursor=pointer]
          - button "I" [ref=e105] [cursor=pointer]
          - button "U" [ref=e106] [cursor=pointer]
          - generic "Text colour" [ref=e107]:
            - text: Text
            - textbox "Text colour" [ref=e108]: "#000000"
          - generic "Original text cover colour" [ref=e109]:
            - text: Cover
            - textbox "Cover colour" [ref=e110]: "#ffffff"
          - button "Cancel" [ref=e111] [cursor=pointer]
          - button "Apply" [ref=e112] [cursor=pointer]
      - generic [ref=e118]:
        - generic "Rendered PDF page 1" [ref=e119]
        - img [ref=e120]:
          - textbox "Edit PDF text directly on the page" [active] [ref=e127]: After correction
        - text: "1"
      - generic [ref=e129]:
        - generic [ref=e130]: Page 1 / 1
        - button [disabled]
        - button [disabled]
        - button "Zoom out" [ref=e132] [cursor=pointer]
        - button "64%" [ref=e134] [cursor=pointer]
        - button "Zoom in" [ref=e135] [cursor=pointer]
    - button "Choose File" [ref=e137]
    - button "Choose File" [ref=e138]
  - button "Choose File" [ref=e139]
  - button "Choose File" [ref=e140]
  - button "Choose File" [ref=e141]
  - button "Choose File" [ref=e142]
  - status [ref=e143]:
    - text: Opened correction.pdf
    - button "Dismiss notification" [ref=e144] [cursor=pointer]
```

# Test source

```ts
  1  | /** Browser-level release contract for the PDF engine. Not a substitute for manual cross-device QA. */
  2  | import { test, expect } from '@playwright/test';
  3  | import { PDFDocument, StandardFonts } from 'pdf-lib';
  4  | import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
  5  | import { readFile } from 'node:fs/promises';
  6  | import { expectDocumentReady } from './diagnostics';
  7  | 
  8  | async function fixturePdf(text = 'Before correction'): Promise<Buffer> {
  9  |   const doc = await PDFDocument.create();
  10 |   const font = await doc.embedFont(StandardFonts.Helvetica);
  11 |   const page = doc.addPage([595, 842]);
  12 |   page.drawText(text, { x: 72, y: 720, size: 16, font });
  13 |   page.drawText('Keep this other heading', { x: 72, y: 675, size: 14, font });
  14 |   return Buffer.from(await doc.save());
  15 | }
  16 | 
  17 | async function readText(pdfBytes: Uint8Array): Promise<{ pages: number; text: string }> {
  18 |   const pdf = await getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true }).promise;
  19 |   try {
  20 |     const content: string[] = [];
  21 |     for (let i = 1; i <= pdf.numPages; i++) {
  22 |       const page = await pdf.getPage(i);
  23 |       const items = (await page.getTextContent()).items;
  24 |       content.push(items.map(item => 'str' in item ? item.str : '').join(' '));
  25 |     }
  26 |     return { pages: pdf.numPages, text: content.join('\n') };
  27 |   } finally {
  28 |     await pdf.destroy();
  29 |   }
  30 | }
  31 | 
  32 | test('existing PDF text is edited directly and old content is not searchable after export', async ({ page }) => {
  33 |   await page.goto('/');
  34 |   await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
  35 |     name: 'correction.pdf', mimeType: 'application/pdf', buffer: await fixturePdf(),
  36 |   });
  37 |   await expectDocumentReady(page, 'correction.pdf');
  38 |   const hitbox = page.locator('.native-text-hitbox').first();
  39 |   await expect(hitbox).toBeVisible({ timeout: 25_000 });
  40 |   await hitbox.click();
  41 |   const textarea = page.getByRole('textbox', { name: 'Edit PDF text directly on the page' });
  42 |   await expect(textarea).toBeVisible();
  43 |   await textarea.fill('After correction');
> 44 |   await page.getByRole('button', { name: /Apply/ }).click();
     |                                                     ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /Apply/ }) resolved to 2 elements:
  45 | 
  46 |   const [download] = await Promise.all([
  47 |     page.waitForEvent('download'),
  48 |     page.getByRole('button', { name: 'Download' }).click(),
  49 |   ]);
  50 |   expect(download.suggestedFilename()).toBe('correction-paprify.pdf');
  51 |   const filePath = await download.path();
  52 |   expect(filePath).toBeTruthy();
  53 |   const bytes = await readFile(filePath!);
  54 |   const output = await readText(new Uint8Array(bytes));
  55 |   expect(output.pages).toBe(1);
  56 |   expect(output.text).toContain('After correction');
  57 |   expect(output.text).not.toContain('Before correction');
  58 |   // The rest of the reconstructed page is deliberately rasterized.
  59 |   expect(output.text).not.toContain('Keep this other heading');
  60 | });
  61 | 
  62 | test('two documents merge into a valid two-page PDF', async ({ page }) => {
  63 |   await page.goto('/');
  64 |   await page.getByRole('tab', { name: 'Organize PDF' }).click();
  65 |   await page.getByRole('button', { name: /Merge PDF/ }).click();
  66 |   await page.locator('input[type="file"][multiple][accept="application/pdf,.pdf"]').setInputFiles([
  67 |     { name: 'one.pdf', mimeType: 'application/pdf', buffer: await fixturePdf('One') },
  68 |     { name: 'two.pdf', mimeType: 'application/pdf', buffer: await fixturePdf('Two') },
  69 |   ]);
  70 |   await expectDocumentReady(page, 'Merged.pdf');
  71 |   const [download] = await Promise.all([
  72 |     page.waitForEvent('download'),
  73 |     page.getByRole('button', { name: 'Download' }).click(),
  74 |   ]);
  75 |   const bytes = await readFile((await download.path())!);
  76 |   const output = await readText(new Uint8Array(bytes));
  77 |   expect(output.pages).toBe(2);
  78 |   expect(output.text).toContain('One');
  79 |   expect(output.text).toContain('Two');
  80 | });
  81 | 
  82 | test('invalid PDF is rejected without entering the workspace', async ({ page }) => {
  83 |   await page.goto('/');
  84 |   await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
  85 |     name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Not a PDF'),
  86 |   });
  87 |   await expect(page.getByRole('status')).toContainText('Could not open PDF');
  88 |   await expect(page.getByRole('heading', { name: 'Everything you need to work with PDFs.' })).toBeVisible();
  89 | });
  90 | 
```