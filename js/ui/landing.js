// Landing-page interactions and interactive sample document.

const demoStyles = { violet: ['#ddd7ff', '#6555e8'], coral: ['#ffe1dc', '#f17870'], mint: ['#d5f9ec', '#23ad83'], gold: ['#fff0c8', '#db9c36'] };
document.querySelectorAll('[data-demo-style]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-demo-style]').forEach(x => x.classList.toggle('active', x == b));
    const [fill, stroke] = demoStyles[b.dataset.demoStyle], demo = $('#demoShape');
    demo.style.background = fill;
    demo.style.borderColor = stroke;
    $('#demoFillChip').style.background = fill;
    $('#demoOutlineChip').style.background = stroke;
    $('#demoFillText').textContent = fill.toUpperCase();
    $('#demoOutlineText').textContent = stroke.toUpperCase();
});
$('#demoFillChip').style.background = demoStyles.violet[0];
$('#demoOutlineChip').style.background = demoStyles.violet[1];
let pendingTool = null, pendingAction = null;
const openWithTool = t => {
    pendingTool = t;
    pendingAction = null;
    pickFile();
};
document.querySelectorAll('[data-start-t]').forEach(b => b.onclick = () => openWithTool(b.dataset.startT));
document.querySelectorAll('[data-start-action]').forEach(b => b.onclick = () => {
    pendingAction = b.dataset.startAction;
    pendingTool = null;
    pickFile();
});
$('#navOpen').onclick = pickFile;
$('#ctaOpen').onclick = pickFile;
$('#drop').addEventListener('keydown', e => {
    if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        pickFile();
    }
});
async function runDemo() {
    if (!window.PDFLib || !window.pdfjsLib)
        return showToast('PDF engine needs a network connection the first time you open this app');
    try {
        const d = await PDFLib.PDFDocument.create(), page = d.addPage([595, 842]);
        const reg = await d.embedFont(PDFLib.StandardFonts.Helvetica), bold = await d.embedFont(PDFLib.StandardFonts.HelveticaBold), rgb = PDFLib.rgb;
        page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(.995, .996, 1) });
        page.drawRectangle({ x: 44, y: 735, width: 5, height: 50, color: rgb(.40, .33, .91) });
        page.drawText('A document you can actually edit', { x: 63, y: 766, size: 23, font: bold, color: rgb(.13, .13, .26) });
        page.drawText('Your interactive PDF Studio playground', { x: 63, y: 746, size: 12, font: reg, color: rgb(.50, .51, .59) });
        page.drawLine({ start: { x: 44, y: 716 }, end: { x: 550, y: 716 }, color: rgb(.90, .89, .96), thickness: 1 });
        page.drawText('Click this sentence with Edit text to rewrite it.', { x: 50, y: 672, size: 14, font: reg, color: rgb(.28, .30, .40) });
        page.drawText('Select the lavender shape and customize fill, outline, width and opacity.', { x: 50, y: 644, size: 11, font: reg, color: rgb(.46, .46, .55) });
        page.drawText('Try dragging, resizing, duplicating, signing, and exporting the PDF.', { x: 50, y: 625, size: 11, font: reg, color: rgb(.46, .46, .55) });
        page.drawText('This sample is created locally, right inside your browser.', { x: 50, y: 160, size: 11, font: reg, color: rgb(.45, .46, .56) });
        page.drawLine({ start: { x: 50, y: 135 }, end: { x: 545, y: 135 }, thickness: 1, color: rgb(.91, .91, .95) });
        page.drawText('PDF STUDIO / INTERACTIVE SAMPLE', { x: 50, y: 113, size: 8, font: bold, color: rgb(.41, .35, .81) });
        await loadPdfDocument(new File([await d.save()], 'PDF-Studio-Demo.pdf', { type: 'application/pdf' }));
        const a = { id: nextAnnotationId++, t: 'shp', k: 'round', x: 94, y: 304, w: 405, h: 171, fill: '#ddd7ff', fo: 1, c: '#6555e8', sw: 3, dash: 'solid', s: 20, tc: '#39305f', txt: 'Your ideas, your document', f: { k: 'h', b: 1, i: 0 } };
        annotations[0] = [a, { id: nextAnnotationId++, t: 'shp', k: 'ell', x: 390, y: 505, w: 90, h: 90, fill: '#d5f9ec', fo: 1, c: '#23ad83', sw: 3, dash: 'dashed', s: 14, tc: '#12624c', txt: '', f: { k: 'h', b: 0, i: 0 } }];
        setTool('select');
        selectObject({ i: 0, id: a.id });
        view.scrollTop = 0;
        refreshEditorUI();
        showToast('Demo loaded · Try changing the shape appearance on the right');
    }
    catch (e) {
        console.error('Demo error', e);
        showToast('Could not create the demo document');
    }
}
$('#tryDemo').onclick = runDemo;
$('#ctaDemo').onclick = runDemo;
// The original picker is reused; the chosen landing tool is activated after loading.
$('#f').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f)
        return;
    await loadPdfDocument(f);
    if (!documentBytes)
        return;
    const t = pendingTool, action = pendingAction;
    pendingTool = pendingAction = null;
    if (t == 'sig')
        openSignatureDialog();
    else if (t == 'img')
        $('#fi').click();
    else if (t)
        setTool(t);
    if (action == 'pages') {
        $('#th').hidden = false;
        renderPageThumbnails();
    }
};
highlightSelectedColor();
setTool('select');
refreshEditorUI();
