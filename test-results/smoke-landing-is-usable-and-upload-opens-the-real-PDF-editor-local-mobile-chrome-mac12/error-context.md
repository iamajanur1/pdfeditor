# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> landing is usable and upload opens the real PDF editor
- Location: tests/smoke.spec.ts:13:1

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
          - textbox "Edit PDF text directly on the page" [active] [ref=e125]: Edited sample text
        - text: "1"
      - generic [ref=e127]:
        - generic [ref=e128]: Page 1 / 1
        - button [disabled]
        - button [disabled]
        - button "Zoom out" [ref=e130] [cursor=pointer]
        - button "64%" [ref=e132] [cursor=pointer]
        - button "Zoom in" [ref=e133] [cursor=pointer]
    - button "Choose File" [ref=e135]
    - button "Choose File" [ref=e136]
  - button "Choose File" [ref=e137]
  - button "Choose File" [ref=e138]
  - button "Choose File" [ref=e139]
  - button "Choose File" [ref=e140]
  - status [ref=e141]:
    - text: Opened smoke.pdf
    - button "Dismiss notification" [ref=e142] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PDFDocument, StandardFonts } from 'pdf-lib';
  3  | import { expectDocumentReady } from './diagnostics';
  4  | 
  5  | async function testPdf(): Promise<Buffer> {
  6  |   const doc = await PDFDocument.create();
  7  |   const font = await doc.embedFont(StandardFonts.Helvetica);
  8  |   const page = doc.addPage([595, 842]);
  9  |   page.drawText('Original sample text', { x: 72, y: 720, size: 16, font });
  10 |   return Buffer.from(await doc.save());
  11 | }
  12 | 
  13 | test('landing is usable and upload opens the real PDF editor', async ({ page }) => {
  14 |   await page.goto('/');
  15 |   await expect(page.getByRole('heading', { name: 'Everything you need to work with PDFs.' })).toBeVisible();
  16 |   await page.locator('input[type="file"][accept*="application/pdf"]').first().setInputFiles({
  17 |     name: 'smoke.pdf', mimeType: 'application/pdf', buffer: await testPdf(),
  18 |   });
  19 |   await expectDocumentReady(page, 'smoke.pdf');
  20 |   await expect(page.locator('.native-text-hitbox').first()).toBeVisible({ timeout: 20_000 });
  21 |   await page.locator('.native-text-hitbox').first().click();
  22 |   const edit = page.getByRole('textbox', { name: 'Edit PDF text directly on the page' });
  23 |   await expect(edit).toBeVisible();
  24 |   await edit.fill('Edited sample text');
> 25 |   await page.getByRole('button', { name: /Apply/ }).click();
     |                                                     ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /Apply/ }) resolved to 2 elements:
  26 |   const downloadPromise = page.waitForEvent('download');
  27 |   await page.getByRole('button', { name: 'Download' }).click();
  28 |   const download = await downloadPromise;
  29 |   expect(download.suggestedFilename()).toBe('smoke-paprify.pdf');
  30 |   expect(await download.failure()).toBeNull();
  31 | });
  32 | 
  33 | test('tools directory exposes working actions on mobile', async ({ page }) => {
  34 |   await page.goto('/');
  35 |   // The hidden native file input and visible dropzone have overlapping names.
  36 |   // Test the actual user-facing dropzone rather than an ambiguous role query.
  37 |   await expect(page.locator('.hero-dropzone')).toBeVisible();
  38 |   await page.getByRole('tab', { name: 'Convert from PDF' }).click();
  39 |   await expect(page.getByRole('button', { name: /PDF to Word/ })).toBeVisible();
  40 | });
  41 | 
```