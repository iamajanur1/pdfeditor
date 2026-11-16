# Paprify 2.3 — Public-launch source candidate

Paprify is a frontend-only, account-free PDF workspace using React, TypeScript, Vite, PDF.js and pdf-lib. Documents are processed in the browser.

**Important: this ZIP is not a prebuilt or independently certified production release.** Its source was checked for TypeScript syntax, local imports and configuration integrity in a restricted environment, but dependencies could not be downloaded. Consequently the production build, automated browser tests and live HTTPS verification must still pass before opening the site to public users.

See **LAUNCH.md** for the exact release workflow and **RELEASE_STATUS.md** for the audit results.

## Main workflows

- Open PDF files directly in the browser, browse thumbnails, select existing text, and edit it **inline** on the page; no text-edit popup is used.
- Format supported text with a font choice, font size, bold, italic, underline, foreground and cover colours. Insert text, images, signatures, stamps, shapes, highlighters and notes.
- Reorder, rotate, duplicate, add and remove pages. Merge, extract and split documents.
- Work with supported PDF text fields, checkboxes and dropdowns.
- Export PDF, images (JPG/PNG/WebP ZIP), text, Markdown, HTML, JSON, text-based DOCX and reflowable EPUB. Convert JPG/PNG/WebP/BMP images and TXT files to PDF.
- No signup or server-side document uploads. Light/dark responsive interfaces, local-only saved signatures, lazy-loaded editor and nearby-page rendering.

## How existing PDF text edits work

On pages with original-text corrections, Paprify **reconstructs the edited page** when saving:

1. Render the page at high resolution using PDF.js.
2. Clear the pixel area corresponding to the replaced original text.
3. Embed the processed page as a background image in a fresh PDF page.
4. Write Paprify's replacement text and all annotations onto the page.

This prevents retaining the original **PDF text operators** on reconstructed pages, unlike an opaque rectangle placed over a copied PDF page. However, **other original text on that edited page becomes image-based** and therefore is no longer selectable/searchable in the exported PDF. Paprify's replacement text remains a separate, usually selectable, text layer. Original embedded fonts are not guaranteed to be preserved.

**Not a secure redaction application.** Pixel region detection can be imperfect, there can be other copies of content elsewhere in a document, and embedded metadata/attachments are not comprehensively sanitized. Do not rely on Paprify for removing sensitive information. Use dedicated redaction software for that.

## Requirements

Node.js 22 or later, npm, and internet access to npm packages. Modern Chrome, Firefox, Edge or Safari. Browsers and PDF capabilities vary on low-memory phones.

```bash
npm install
npm run dev
```

For a deployable build:

```bash
npm ci
npm run validate
npm audit --omit=dev --audit-level=high
npx playwright install chromium webkit
npm run test:e2e
```

After **all checks pass**, `dist/` is the static site to deploy. The generated `package-lock.json` should be committed with the source for reproducibility.

## Scope boundaries

This release does **not** claim: editing arbitrary embedded PDF content objects in place, exact font recovery, OCR of scanned PDFs, accurate PDF-to-Word layout recreation, professional PDF-to-Excel/PPTX conversion, digital certificate signing, or secure redaction. For scanned documents, annotations work but text recognition requires a separate OCR engine.

Review exported documents carefully before official use. In particular, verify forms, non-Latin text, fonts, transparency and rotated pages.
