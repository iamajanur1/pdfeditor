# Paprify public launch — operational checklist

**Do not publish as final until these gates pass.** The ZIP contains application source code and tests, not a verified `dist` build.

## 1. Create locked dependency installation

With Node.js 22 and unrestricted npm registry access:

```bash
npm install
npm ci
```

The first command creates `package-lock.json` and the second confirms a clean installation from it. Keep `package-lock.json` in your production repository and use `npm ci` for later builds.

## 2. Production build and security scan

```bash
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```

The build must produce `dist/index.html` and compiled files in `dist/assets`. Fix TypeScript, build errors and high/critical security findings before continuing. Do not suppress failures.

## 3. Browser regression tests

```bash
npx playwright install chromium webkit
npm run test:e2e
```

Tests are configured for Chromium, mobile Chromium, WebKit and mobile WebKit. They exercise upload, inline text editing and downloaded output, merging, and invalid input. The tests specifically verify that the old original text is not extractable from a reconstructed page and document page order stays correct.

**Manual browser tests also required:** Undo/redo, text edit/cancel/format, forms, annotations, stamps, signatures, notes, page management, rotate, split, image import, all PDF conversions and reopen, file error paths, memory and rendering speed. Check Chrome/Firefox/Safari, real Android and iOS hardware, and light/dark layouts.

## 4. Verify actual exported PDFs

Compare original/edited pages using PDF viewers and PDF text extraction. Check complex fonts, scanned PDFs, multilingual text, shapes, forms, transparency, rotated and non-white backgrounds. Edited pages are reconstructed: other original content on those pages is not text-searchable. Do not use as secure redaction.

## 5. Deploy only validated dist

### Vercel

- Import the repository containing this project.
- Choose **Vite**.
- Set **Build command**: `npm run build`, **Output directory**: `dist`.
- Deploy. The included `vercel.json` sets baseline security headers and long-term cache headers for fingerprinted assets.

### Netlify / Cloudflare Pages / other static hosting

- Run the verified build in CI, or use the provider's Node 22 build environment.
- Publish `dist/`; do not publish the source folder or `node_modules/`.
- Apply the equivalent headers from `public/_headers`.

Confirm that the production CSP does not block PDF.js workers, rendering, printing or exports. Test uploads, downloads, image conversion and mobile editing on the **live HTTPS URL**.

## 6. Operational approval

Publish a support/contact method and a public statement of privacy and product limits. Check performance and device memory, fix any failing browser cases, ensure only supported tools are advertised, and approve public launch only when all required gates are green.

## What if npm dependencies cannot install?

The project cannot be certified or deployed as a tested static build without npm dependencies. This package cannot fix a machine's blocked npm network access by itself. Run the CI pipeline on a connected machine, fix any issues it reports, and deploy the generated `dist/` only after the gates pass.
