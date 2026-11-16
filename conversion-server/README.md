# Paprify Conversion Service (optional)

The existing Paprify site is a static, local-in-browser app. **Office conversions cannot be produced reliably by the frontend's PDF.js/pdf-lib stack alone.** This optional FastAPI service uses LibreOffice to convert Office files to PDF, and PDF-oriented engines to export PDF into DOCX/XLSX/PPTX.

## Install on a dedicated conversion host

```bash
sudo apt-get install -y libreoffice poppler-utils tesseract-ocr
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# OPTIONAL: Enhanced PDF-to-Word, subject to license review:
# pip install -r requirements-optional-word.txt
uvicorn app:app --host 127.0.0.1 --port 8010
```

From the project root, `npm run dev` proxies `/api/conversion` to port 8010. For production, reverse-proxy `/api/conversion/*` to port 8010 on the **same trusted HTTPS origin**; do not expose an unauthenticated conversion API to the internet without request rate limits, CPU and memory caps, sandboxed LibreOffice, malware scanning, HTTPS, worker concurrency limits and abuse protections. A statically deployed Vercel site cannot run this server automatically.

The UI always discloses uploading a document for server conversions and requires explicit confirmation. Processing uses temporary directories which are removed after conversion. This does not guarantee isolation from OS-level caches, monitoring, reverse-proxy request storage or infra logs: configure your host accordingly.

### Conversion quality boundaries
- Word/Excel/PowerPoint/ODF to PDF: LibreOffice headless. Font substitution, macros, formulas, pagination and animations may differ from Microsoft Office.
- PDF to editable Word: optional `pdf2docx` rebuilds PDF text/layout; difficult columns/forms and scans may require manual correction. pdf2docx/PyMuPDF have licensing obligations to review for a commercial hosted product.
- PDF to XLSX: ruled tables detected with pdfplumber; does not recover original formulas, charts, or tables without detectable boundaries.
- PDF to PPTX: preserves appearance as a **full-slide image per page**, not editable text/shapes.
- PDF scans: optional English Tesseract OCR to editable text DOCX; it does not retain page layout, fonts or tables. Install `tesseract-ocr` on the server for this mode.

### Production security
This is a functional conversion reference backend, **not a hardened multi-tenant public upload service**. Run the API in a disposable non-root container with no access to host documents, no egress where practical, upload size/time/output limits and infrastructure rate limits; use up-to-date libraries and security patching.
