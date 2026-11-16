"""Optional Paprify conversion API. Run in an isolated container with resource limits.

The client sends files here ONLY after an explicit conversion action and consent.
Temporary files are removed before the response is returned.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

MAX_UPLOAD = 25 * 1024 * 1024
MAX_OUTPUT = 100 * 1024 * 1024
OFFICE_INPUTS = {'.doc', '.docx', '.odt', '.rtf', '.xls', '.xlsx', '.ods', '.ppt', '.pptx', '.odp'}
MIME = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

app = FastAPI(title='Paprify optional document conversions', docs_url=None, redoc_url=None)


def available_tools() -> dict[str, bool]:
    # The package includes a separate optional dependency specifically for PDF-to-Word.
    try:
        import pdf2docx  # noqa: F401
        pdf_to_word = True
    except ImportError:
        pdf_to_word = False
    try:
        import pdfplumber  # noqa: F401
        import openpyxl  # noqa: F401
        pdf_to_excel = True
    except ImportError:
        pdf_to_excel = False
    try:
        import pptx  # noqa: F401
        pdf_to_slides = shutil.which('pdftoppm') is not None
    except ImportError:
        pdf_to_slides = False
    return {
        'pdf_to_ocr_docx': shutil.which('pdftoppm') is not None and shutil.which('tesseract') is not None,
        'office_to_pdf': shutil.which('libreoffice') is not None,
        'pdf_to_docx': pdf_to_word,
        'pdf_to_xlsx': pdf_to_excel,
        'pdf_to_pptx': pdf_to_slides,
    }


@app.get('/api/conversion/status')
def status():
    return {'enabled': True, 'max_upload_mb': 25, 'features': available_tools(),
            'privacy': 'Files are processed on the configured server in a temporary directory.'}


def valid_input(suffix: str, target: str) -> bool:
    return (target == 'pdf' and suffix in OFFICE_INPUTS) or (suffix == '.pdf' and target in {'docx', 'xlsx', 'pptx'})


def run_command(command: list[str], cwd: Path, timeout: int = 120):
    try:
        result = subprocess.run(command, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False, env={**os.environ, 'HOME': str(cwd)})
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, 'The conversion exceeded the 2-minute processing limit.') from exc
    except OSError as exc:
        raise HTTPException(503, 'Required conversion software is not installed.') from exc
    if result.returncode:
        raise HTTPException(422, 'The converter could not process this document. Check that it is not corrupt or password protected.')


def convert_office(input_path: Path, outdir: Path) -> Path:
    executable = shutil.which('libreoffice')
    if not executable:
        raise HTTPException(503, 'Office conversion requires LibreOffice on the conversion server.')
    profile = outdir / 'lo-profile'
    run_command([executable, '-env:UserInstallation=' + profile.as_uri(), '--headless', '--nologo',
                 '--nodefault', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', str(outdir), str(input_path)], outdir)
    output = outdir / (input_path.stem + '.pdf')
    if not output.is_file() or output.stat().st_size == 0:
        raise HTTPException(422, 'LibreOffice did not produce a usable PDF.')
    if not output.read_bytes()[:8].startswith(b'%PDF-'):
        raise HTTPException(422, 'The generated file is not a PDF.')
    return output


def convert_word(input_path: Path, outdir: Path) -> Path:
    try:
        from pdf2docx import Converter
    except ImportError as exc:
        raise HTTPException(503, 'Enhanced PDF-to-Word requires the optional pdf2docx conversion engine.') from exc
    output = outdir / 'result.docx'
    converter = Converter(str(input_path))
    try:
        converter.convert(str(output), start=0, end=None)
    except Exception as exc:
        raise HTTPException(422, 'PDF-to-Word could not reconstruct this PDF. Use local text or visual DOCX mode instead.') from exc
    finally:
        converter.close()
    if not output.exists() or output.stat().st_size == 0:
        raise HTTPException(422, 'PDF-to-Word produced no output.')
    return output



def convert_ocr_word(input_path: Path, outdir: Path) -> Path:
    """Editable text recovery from scans; no claim of font or layout fidelity."""
    try:
        from docx import Document
        from pypdf import PdfReader
        count = len(PdfReader(str(input_path), strict=False).pages)
    except Exception as exc:
        raise HTTPException(422, 'Could not read the PDF for OCR.') from exc
    if count < 1 or count > 20:
        raise HTTPException(413, 'Scanned PDF OCR supports 1–20 pages per conversion.')
    document = Document()
    for page_num in range(1, count + 1):
        page_prefix = outdir / f'ocr-{page_num:03d}'
        run_command(['pdftoppm', '-f', str(page_num), '-l', str(page_num), '-r', '200', '-singlefile',
                     '-gray', '-png', str(input_path), str(page_prefix)], outdir, timeout=30)
        picture = page_prefix.with_suffix('.png')
        if not picture.is_file():
            raise HTTPException(422, f'Could not render page {page_num} for OCR.')
        try:
            output = subprocess.run(['tesseract', str(picture), 'stdout', '-l', 'eng', '--psm', '3'],
                                    cwd=str(outdir), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(503, 'The OCR engine is unavailable or timed out.') from exc
        finally:
            picture.unlink(missing_ok=True)
        if output.returncode != 0:
            raise HTTPException(422, f'Could not read page {page_num} with OCR.')
        if page_num > 1:
            document.add_page_break()
        text = output.stdout.decode('utf-8', errors='replace').strip()
        for paragraph in text.splitlines():
            document.add_paragraph(paragraph)
    output = outdir / 'recognized.docx'
    document.save(output)
    return output



def excel_cell(value: str | None):
    """Retain identifiers as strings, but let Excel calculate with real numbers."""
    raw = (value or '').strip()
    if re.fullmatch(r'[-+]?(?:[1-9]\d{0,11}|0)(?:\.\d{1,8})?', raw.replace(',', '')) and not re.match(r'^[-+]?0\d', raw):
        without_commas = raw.replace(',', '')
        return float(without_commas) if '.' in without_commas else int(without_commas)
    return raw[:32767]


def convert_excel(input_path: Path, outdir: Path) -> Path:
    try:
        import pdfplumber
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError as exc:
        raise HTTPException(503, 'PDF-to-Excel requires pdfplumber and openpyxl.') from exc

    output = outdir / 'tables.xlsx'
    workbook = Workbook()
    workbook.remove(workbook.active)
    table_count = 0
    with pdfplumber.open(str(input_path)) as pdf:
        if len(pdf.pages) > 200:
            raise HTTPException(413, 'Extract PDF tables from 200 pages or fewer per request.')
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            if not tables:
                # Try aligned text columns when the PDF has no visible gridlines.
                possible = page.extract_tables(table_settings={
                    'vertical_strategy': 'text', 'horizontal_strategy': 'text',
                    'min_words_vertical': 2, 'min_words_horizontal': 1,
                }) or []
                tables = [
                    [row for row in candidate if any(str(v or '').strip() for v in row)]
                    for candidate in possible
                    if candidate and len(candidate) >= 2 and max(len(row) for row in candidate) >= 2
                ]
                tables = [candidate for candidate in tables if len(candidate) >= 2 and
                          sum(sum(bool(str(v or '').strip()) for v in row) >= 2 for row in candidate) >= 2]
            if not tables:
                continue
            sheet = workbook.create_sheet(f'Page {page_number}')
            for table in tables:
                if not table or not any(any(value and value.strip() for value in row if isinstance(value, str)) for row in table):
                    continue
                if sheet.max_row > 1:
                    sheet.append([])
                for index, row in enumerate(table):
                    # Strings are written verbatim, never interpreted as Excel formulas.
                    sheet.append([excel_cell(value) for value in row])
                    for cell in sheet[sheet.max_row]:
                        if isinstance(cell.value, str):
                            cell.data_type = 's'  # Never interpret =... as a formula.
                        cell.alignment = Alignment(wrap_text=True, vertical='top')
                        if index == 0:
                            cell.font = Font(bold=True)
                            cell.fill = PatternFill('solid', fgColor='E9EEF5')
                table_count += 1
            if sheet.max_row == 1 and not sheet['A1'].value:
                workbook.remove(sheet)
                continue
            sheet.freeze_panes = 'A2'
            for col in sheet.columns:
                letter = get_column_letter(col[0].column)
                sheet.column_dimensions[letter].width = min(55, max(12, max(len(str(c.value or '')) for c in col) + 2))
    if table_count == 0:
        raise HTTPException(422, 'No recognizable tables found. Scans or irregular layouts may require OCR or manual extraction.')
    workbook.save(output)
    return output


def convert_slides(input_path: Path, outdir: Path) -> Path:
    try:
        from pptx import Presentation
        from pptx.util import Inches
    except ImportError as exc:
        raise HTTPException(503, 'PDF-to-PowerPoint requires python-pptx.') from exc
    if not shutil.which('pdftoppm'):
        raise HTTPException(503, 'PDF-to-PowerPoint also requires Poppler pdftoppm.')
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(input_path), strict=False)
        count = len(reader.pages)
        first_page = reader.pages[0]
        width_pt, height_pt = float(first_page.mediabox.width), float(first_page.mediabox.height)
    except Exception as exc:
        raise HTTPException(422, 'Cannot read PDF pages.') from exc
    if count < 1 or count > 75:
        raise HTTPException(413, 'PDF-to-PowerPoint supports 1–75 pages at a time.')
    if min(width_pt, height_pt) <= 0:
        raise HTTPException(422, 'Invalid PDF page dimensions.')
    slides = Presentation()
    slides.slide_width = Inches(width_pt / 72)
    slides.slide_height = Inches(height_pt / 72)
    blank = slides.slide_layouts[6]
    images_prefix = outdir / 'slide'
    run_command(['pdftoppm', '-f', '1', '-l', str(count), '-r', '144', '-jpeg',
                 '-jpegopt', 'quality=90', str(input_path), str(images_prefix)], outdir)
    pictures = sorted(outdir.glob('slide-*.jpg'), key=lambda path: int(path.stem.rsplit('-', 1)[-1]))
    if len(pictures) != count:
        raise HTTPException(422, 'Some pages could not be rendered into slides.')
    from PIL import Image
    for file in pictures:
        slide = slides.slides.add_slide(blank)
        # Preserve each page's aspect ratio even when a PDF mixes page sizes.
        # The visual content is a picture, NOT editable PowerPoint text or shapes.
        with Image.open(file) as image:
            img_w, img_h = image.size
        factor = min(int(slides.slide_width) / img_w, int(slides.slide_height) / img_h)
        width, height = int(img_w * factor), int(img_h * factor)
        slide.shapes.add_picture(str(file), (int(slides.slide_width) - width) // 2,
                                 (int(slides.slide_height) - height) // 2, width=width, height=height)
    output = outdir / 'slides.pptx'
    slides.save(output)
    return output


@app.post('/api/conversion/convert')
async def convert(target: str = Query(pattern='^(pdf|docx|xlsx|pptx)$'), ocr: bool = False, file: UploadFile = File(...)):
    suffix = Path(file.filename or '').suffix.lower()
    if not valid_input(suffix, target):
        raise HTTPException(415, 'Unsupported input/output combination for this conversion tool.')
    try:
        source_data = await file.read(MAX_UPLOAD + 1)
    finally:
        await file.close()
    if not source_data:
        raise HTTPException(422, 'The selected document is empty.')
    if len(source_data) > MAX_UPLOAD:
        raise HTTPException(413, 'The server accepts files no larger than 25 MB.')
    if suffix == '.pdf' and b'%PDF-' not in source_data[:1024]:
        raise HTTPException(422, 'This file does not contain a PDF header.')
    if suffix in {'.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp'} and not source_data.startswith(b'PK'):
        raise HTTPException(422, 'This document does not look like a valid Office ZIP package.')
    feature = 'office_to_pdf' if target == 'pdf' else ('pdf_to_ocr_docx' if ocr and target == 'docx' else f'pdf_to_{target}')
    if not available_tools().get(feature, False):
        raise HTTPException(503, f'The {target.upper()} conversion engine is not installed on this server.')

    with tempfile.TemporaryDirectory(prefix='paprify-', dir=os.getenv('CONVERSION_TEMP_DIR') or None) as tmp:
        folder = Path(tmp)
        # Never use the user-controlled filename in file paths or commands.
        input_path = folder / ('input' + suffix)
        input_path.write_bytes(source_data)
        if target == 'pdf':
            result = convert_office(input_path, folder)
        elif target == 'docx':
            result = convert_ocr_word(input_path, folder) if ocr else convert_word(input_path, folder)
        elif target == 'xlsx':
            result = convert_excel(input_path, folder)
        else:
            result = convert_slides(input_path, folder)
        if result.stat().st_size > MAX_OUTPUT:
            raise HTTPException(413, 'Converted file exceeds the 100 MB download limit.')
        payload = result.read_bytes()
    safe_stem = re.sub(r'[^a-zA-Z0-9_-]+', '-', Path(file.filename or 'document').stem)[:60] or 'document'
    return Response(payload, media_type=MIME[target], headers={
        'Content-Disposition': f'attachment; filename="{safe_stem}-converted.{target}"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    })
