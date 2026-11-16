from __future__ import annotations

from io import BytesIO
from pathlib import Path
import importlib.util
import sys

import pytest
from fastapi.testclient import TestClient
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from docx import Document
from pypdf import PdfReader
from openpyxl import load_workbook
from pptx import Presentation

sys.path.insert(0, str(Path(__file__).parents[1]))
from app import app, available_tools

client = TestClient(app)


def pdf_with_table() -> bytes:
    out = BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4)
    table = Table([['Product', 'Qty'], ['Apples', '10'], ['Tea', '5']])
    table.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 1, colors.black)]))
    doc.build([Paragraph('Sample table', getSampleStyleSheet()['Heading1']), table])
    return out.getvalue()


def office_file() -> bytes:
    doc = Document()
    doc.add_heading('Conversion sample', 1)
    doc.add_paragraph('Hello from Paprify!')
    dest = BytesIO()
    doc.save(dest)
    return dest.getvalue()


def post(name: str, data: bytes, target: str):
    return client.post('/api/conversion/convert', params={'target': target}, files={'file': (name, data)})


def test_status_exposes_real_features():
    response = client.get('/api/conversion/status')
    assert response.status_code == 200
    assert response.json()['features'] == available_tools()


def test_rejects_wrong_input_and_pdf_magic():
    assert post('sample.txt', b'hello', 'pdf').status_code == 415
    assert post('bad.pdf', b'not a pdf', 'pptx').status_code == 422
    assert post('sample.docx', b'invalid package', 'pdf').status_code == 422


def test_pdf_tables_to_editable_excel():
    if not available_tools()['pdf_to_xlsx']:
        pytest.skip('PDF-to-Excel not installed')
    response = post('table.pdf', pdf_with_table(), 'xlsx')
    assert response.status_code == 200, response.text
    workbook = load_workbook(BytesIO(response.content))
    assert workbook.sheetnames == ['Page 1']
    sheet = workbook.active
    assert [sheet['A1'].value, sheet['B1'].value] == ['Product', 'Qty']
    assert sheet['A2'].value == 'Apples'


def test_pdf_to_slide_images():
    if not available_tools()['pdf_to_pptx']:
        pytest.skip('PDF-to-PPTX not installed')
    response = post('table.pdf', pdf_with_table(), 'pptx')
    assert response.status_code == 200, response.text
    slides = Presentation(BytesIO(response.content))
    assert len(slides.slides) == 1
    assert len(slides.slides[0].shapes) == 1


def test_word_to_pdf_round_trip():
    if not available_tools()['office_to_pdf']:
        pytest.skip('LibreOffice not installed')
    response = post('sample.docx', office_file(), 'pdf')
    assert response.status_code == 200, response.text
    assert response.content.startswith(b'%PDF-')
    assert len(PdfReader(BytesIO(response.content)).pages) == 1


def test_limits_oversized_input():
    response = post('huge.pdf', b'%PDF-1.7\n' + (b'a' * (25 * 1024 * 1024 + 1)), 'xlsx')
    assert response.status_code == 413


def test_scanned_pdf_ocr_produces_editable_word():
    if not available_tools()['pdf_to_ocr_docx']:
        pytest.skip('Tesseract OCR is not installed')
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    image = Image.new('RGB', (1000, 300), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((35, 75), 'PAPRIFY OCR SAMPLE', fill='black', font=ImageFont.truetype('DejaVuSans.ttf', 60))
    output = BytesIO()
    page = canvas.Canvas(output, pagesize=(600, 200))
    page.drawImage(ImageReader(image), 0, 0, 600, 200)
    page.save()
    response = client.post('/api/conversion/convert?target=docx&ocr=true', files={'file': ('scan.pdf', output.getvalue())})
    assert response.status_code == 200, response.text
    document = Document(BytesIO(response.content))
    assert 'PAPRIFY OCR SAMPLE' in '\n'.join(p.text for p in document.paragraphs)


def test_excel_and_powerpoint_to_pdf():
    if not available_tools()['office_to_pdf']:
        pytest.skip('LibreOffice not installed')
    excel = __import__('openpyxl').Workbook()
    excel.active['A1'] = 'Workbook conversion test'
    excel_output = BytesIO()
    excel.save(excel_output)
    response = post('numbers.xlsx', excel_output.getvalue(), 'pdf')
    assert response.status_code == 200, response.text
    assert len(PdfReader(BytesIO(response.content)).pages) >= 1

    slides = Presentation()
    slide = slides.slides.add_slide(slides.slide_layouts[6])
    text_box = slide.shapes.add_textbox(1000000, 1000000, 5000000, 600000)
    text_box.text = 'Presentation conversion test'
    slide_output = BytesIO()
    slides.save(slide_output)
    response = post('deck.pptx', slide_output.getvalue(), 'pdf')
    assert response.status_code == 200, response.text
    assert len(PdfReader(BytesIO(response.content)).pages) == 1


def test_borderless_table_and_numeric_cells():
    if not available_tools()['pdf_to_xlsx']:
        pytest.skip('PDF-to-Excel not installed')
    from reportlab.pdfgen import canvas
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(595, 842))
    for i, (name, qty, total) in enumerate([
        ('Product', 'Qty', 'Total'), ('Apples', '10', '120'), ('Tea', '7', '84'),
    ]):
        y = 750 - i * 25
        pdf.drawString(70, y, name)
        pdf.drawString(270, y, qty)
        pdf.drawString(380, y, total)
    pdf.save()
    response = post('columns.pdf', output.getvalue(), 'xlsx')
    assert response.status_code == 200, response.text
    book = load_workbook(BytesIO(response.content))
    sheet = book.active
    assert sheet['A2'].value == 'Apples'
    assert sheet['B2'].value == 10
    assert sheet['C3'].value == 84
