# PDF Studio — Development notes

## Run locally

This is a static browser application. From the project root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. PDF.js, pdf-lib, fontkit and the web fonts are
loaded from CDNs, so editing real PDFs requires network access unless you host
those assets locally.

## Source conventions

- Use four-space JavaScript indentation, semicolons and descriptive function names.
- Add new behavior to the relevant feature file rather than growing a single `app.js`.
- Keep event listeners next to the feature that owns the behavior.
- Keep the original annotation field keys (`t`, `x`, `y`, `w`, `h`, etc.) and saved
  session keys stable unless you also migrate the persisted session data.
- Keep the source order of classic `<script>` tags in `index.html`; this version
  intentionally does not depend on a bundler or package manager.
- Use two-space CSS indentation and preserve the cascade between the four stylesheets.
- Prefer short comments describing **why** the code does something, especially for
  PDF rendering/export, over comments that paraphrase the code itself.

## Manual regression checks

1. Landing page loads and tool directory filtering works.
2. Command menu opens with Ctrl/Cmd+K; Escape closes it.
3. Demo and imported PDFs render when external PDF dependencies load.
4. Select/move/resize objects, change shape fill and outline separately, and undo/redo.
5. Edit existing text and add a new text block.
6. Insert an image, sign, reorder/delete pages, and export.
7. Reload to verify local session recovery.
8. Check responsive layout and the properties drawer on mobile widths.

## Current technical boundaries

- This is still a browser-only PDF editing prototype, not an embedded-object
  editor for arbitrary PDF content.
- The existing implementation uses ordered global script bindings. A later
  module migration should introduce explicit imports, a document model, and
  a proper test runner as a separate change rather than mixing it with styling.
- Test redaction and exported files against your PDF requirements before
  production release. The exported PDF is not guaranteed to provide certified
  content sanitization.
