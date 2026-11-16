# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> existing PDF text is edited directly and old content is not searchable after export
- Location: tests/production.spec.ts:32:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "After correction"
Received string:    "After correctio  n"
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
        - generic "correction.pdf" [ref=e12]
        - generic [ref=e13]: Editing locally
      - generic [ref=e14]:
        - button "Find" [ref=e15] [cursor=pointer]
        - button "Print" [ref=e20] [cursor=pointer]
        - button "Open" [ref=e26] [cursor=pointer]
        - button "Toggle appearance" [ref=e31] [cursor=pointer]
        - button "Download" [active] [ref=e34] [cursor=pointer]
    - generic [ref=e39]:
      - complementary "PDF utilities" [ref=e40]:
        - button "Edit" [ref=e41] [cursor=pointer]
        - button "Organize" [ref=e46] [cursor=pointer]
        - button "Merge" [ref=e52] [cursor=pointer]
        - button "Split" [ref=e58] [cursor=pointer]
        - button "Convert" [ref=e66] [cursor=pointer]
        - button "Forms" [ref=e72] [cursor=pointer]
      - generic [ref=e76]:
        - generic [ref=e77]:
          - toolbar "PDF editing tools" [ref=e78]:
            - generic [ref=e79]:
              - button "Pages" [ref=e80] [cursor=pointer]
              - button "Select" [ref=e87] [cursor=pointer]
              - button "Edit text" [ref=e91] [cursor=pointer]
              - button "Add text" [ref=e95] [cursor=pointer]
              - button "Eraser" [ref=e98] [cursor=pointer]
              - button "Highlight" [ref=e103] [cursor=pointer]
              - button "Draw" [ref=e108] [cursor=pointer]
              - button "Image" [ref=e112] [cursor=pointer]
              - button "Shapes" [ref=e118] [cursor=pointer]
              - button "Cross" [ref=e126] [cursor=pointer]
              - button "Check" [ref=e131] [cursor=pointer]
              - button "Sign" [ref=e135] [cursor=pointer]
              - button "Stamp" [ref=e139] [cursor=pointer]
              - button "Note" [ref=e144] [cursor=pointer]
              - button "Manage pages" [ref=e149] [cursor=pointer]
          - toolbar "Selected tool properties" [ref=e155]:
            - generic [ref=e156]:
              - combobox "Font family" [ref=e157]:
                - option "sans-serif" [selected]
                - option "Arial"
                - option "Times New Roman"
                - option "Courier New"
                - option "Georgia"
                - option "Verdana"
              - generic [ref=e158]:
                - spinbutton "Font size in points" [ref=e159]: "16"
                - generic [ref=e160]: pt
              - generic [ref=e161]:
                - button "B" [ref=e162] [cursor=pointer]
                - button "I" [ref=e163] [cursor=pointer]
                - button "U" [ref=e164] [cursor=pointer]
              - generic [ref=e165]:
                - button "≡" [pressed] [ref=e166] [cursor=pointer]
                - button "☷" [ref=e167] [cursor=pointer]
                - button "≣" [ref=e168] [cursor=pointer]
              - generic "Colour" [ref=e169]:
                - textbox "Colour" [ref=e170]: "#000000"
              - generic [ref=e172]:
                - generic [ref=e173]: Opacity
                - slider [ref=e178]
                - generic [ref=e179]: 100%
              - button "Delete selected element" [ref=e180] [cursor=pointer]
        - generic [ref=e184]:
          - complementary "Document pages" [ref=e186]:
            - generic [ref=e187]:
              - heading "Pages 1" [level=2] [ref=e188]
              - button "Close" [ref=e189] [cursor=pointer]
            - generic [ref=e191]:
              - button "Go to page 1" [ref=e192] [cursor=pointer]:
                - generic [ref=e195]: "1"
              - button "Page 1 actions" [ref=e196] [cursor=pointer]
            - generic [ref=e201]:
              - button "Add page" [ref=e202] [cursor=pointer]
              - button "Manage pages" [ref=e204] [cursor=pointer]
          - generic [ref=e207]:
            - generic "Rendered PDF page 1" [ref=e208]
            - img [ref=e209]:
              - generic [ref=e210]: After correction
            - text: "1"
        - generic [ref=e219]:
          - generic [ref=e220]: Local processing · Edited text pages are reconstructed on export · Not for secure redaction
          - generic [ref=e221]:
            - generic [ref=e222]: Page 1 / 1
            - button [disabled]
            - button [disabled]
            - button "Zoom out" [ref=e224] [cursor=pointer]
            - button "135%" [ref=e226] [cursor=pointer]
            - button "Zoom in" [ref=e227] [cursor=pointer]
    - toolbar "Selected element actions" [ref=e229]:
      - generic [ref=e230]: replacement
      - button "Edit" [ref=e231] [cursor=pointer]
      - button "Duplicate" [ref=e232] [cursor=pointer]
      - button "Delete" [ref=e233] [cursor=pointer]
      - button "Clear selection" [ref=e234] [cursor=pointer]
    - button "Choose File" [ref=e238]
    - button "Choose File" [ref=e239]
  - button "Choose File" [ref=e240]
  - button "Choose File" [ref=e241]
  - button "Choose File" [ref=e242]
  - button "Choose File" [ref=e243]
  - status [ref=e244]:
    - text: PDF exported successfully.
    - button "Dismiss notification" [ref=e245] [cursor=pointer]
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
  44 |   await page.getByRole('button', { name: /Apply/ }).click();
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
> 56 |   expect(output.text).toContain('After correction');
     |                       ^ Error: expect(received).toContain(expected) // indexOf
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