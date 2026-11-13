# PDF Studio — Redesign notes

## UI
- Rebuilt the landing page into a complete product/tool directory with working CTAs and an interactive shape-style preview.
- Reorganized the editor into top actions, a left tool rail, a PDF canvas, a right properties inspector, and a status bar.
- Added responsive inspector visibility on smaller screens.

## Shape editing
- Added a dedicated outline color control separate from fill color.
- Added enable/disable toggles for each, width control, fill opacity, and dashed/dotted outline styles.
- Added a visual preview that follows the selected shape or the configured drawing defaults.
- Added clickable shape presets and linked them to selected-shape editing.
- Shape formatting is applied to the SVG preview and passed to the PDF vector export path.
- Improved vector export for rounded rectangles.

## Functional fixes
- Eliminated duplicate HTML IDs that conflicted between shape selection and signature cancellation.
- Fixed restore-session click bubbling into file selection.
- Recomputed annotation IDs after session restore.
- Reset annotation IDs on newly opened PDFs.
- Fixed handling of shapes with no outline during export.
- Added detailed browser console errors for PDF export failures.
- Added a sample-document workflow for testing without an existing file.

## 2026-11-13 — Studio Refinement / Clean Interactive Edition

- Refined visual hierarchy, spacing, accessibility, landing navigation, and editor layout.
- Added tool-category filtering and live tool search in the landing page.
- Added canvas toolbar: page previews, page-fit zoom, grid toggle, keyboard guide.
- Added desktop collapsible inspector and a context-aware selection hint.
- Added six one-click shape appearance palettes alongside independent fill/outline controls.
- Added keyboard tool shortcuts and accessible Ctrl/Cmd+K quick-action command menu.
- Added "Made by Ajanur Rahman" credit to landing footer and editor status bar.
- Added GitHub URL configuration dialog and local browser persistence, with strict profile URL validation. No unverified profile link was hardcoded.
- Prevented keyboard shortcuts from interfering with text input and modal dismissals.
- Tested in headless Chromium with UI fixtures: card filter/search, menu, shape properties, grid, fit, panel collapse, shortcuts, GitHub validation, mobile width.
- Full PDF import/export regression remains dependent on externally loaded PDF.js and pdf-lib and was not run in this restricted test environment.
