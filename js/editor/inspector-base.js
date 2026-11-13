// Formatting controls, PDF forms, merge, fonts, and session recovery.

function refreshInspector() {
    const a = selectedObject && getSelectedObject(), shape = a && a.t == 'shp', writing = a && (a.t == 'text' || a.t == 'edit');
    const activeShape = tool == 'shp' || shape;
    $('#shapeTools').hidden = !activeShape;
    $('#fb').hidden = !(activeShape || writing);
    $('#fb').querySelector('.inspector-section').hidden = !activeShape;
    $('#genericAppearance').hidden = !!activeShape;
    $('#appearanceMode').textContent = shape ? 'SELECTED SHAPE' : 'NEW SHAPES';
    if (a && a.f)
        $('#ff').value = a.f.k;
    if (shape) {
        $('#sk').value = a.k;
        $('#oc').value = a.c == 'none' ? $('#oc').value : a.c;
        $('#fc').value = a.fill == 'none' ? $('#fc').value : a.fill;
        $('#ow').value = a.sw;
        $('#fo').value = Math.round((a.fo ?? 1) * 100);
        $('#os').value = a.dash || 'solid';
        $('#fillEnabled').checked = a.fill != 'none';
        $('#outlineEnabled').checked = a.c != 'none';
    }
    refreshAppearanceUI();
    $('#szValue').textContent = $('#sz').value + ' px';
}
const fa = fn => {
    const a = selectedObject && getSelectedObject();
    if (!a)
        return;
    pushUndoSnapshot();
    fn(a);
    renderPageAnnotations(selectedObject.i);
    refreshInspector();
}, F0 = a => a.f = a.f || { k: 'h', b: 0, i: 0 };
$('#ff').onchange = e => fa(a => F0(a).k = e.target.value);
$('#fbb').onclick = () => fa(a => {
    F0(a).b ^= 1;
});
$('#fbi').onclick = () => fa(a => {
    F0(a).i ^= 1;
});
$('#fm').onclick = () => fa(a => a.s = Math.max(6, a.s - 2));
$('#fp').onclick = () => fa(a => a.s += 2);
// Live shape appearance properties are wired below (fill and outline work independently).
$('#tc').onchange = e => fa(a => {
    if (a.t == 'shp')
        a.tc = e.target.value;
    else
        a.c = e.target.value;
});
$('#dup').onclick = () => {
    const a = selectedObject && getSelectedObject();
    if (!a)
        return;
    pushUndoSnapshot();
    const n = structuredClone(a);
    n.id = nextAnnotationId++;
    if (n.p)
        n.p = n.p.map(q => [q[0] + 12, q[1] + 12]);
    else {
        n.x += 12;
        n.y += 12;
    }
    annotations[selectedObject.i].push(n);
    selectedObject = { i: selectedObject.i, id: n.id };
    renderPageAnnotations(selectedObject.i);
};
$('#fr').onclick = () => {
    if (!selectedObject)
        return;
    pushUndoSnapshot();
    const L = annotations[selectedObject.i], k = L.findIndex(q => q.id == selectedObject.id);
    L.push(...L.splice(k, 1));
    renderPageAnnotations(selectedObject.i);
};
$('#bk').onclick = () => {
    if (!selectedObject)
        return;
    pushUndoSnapshot();
    const L = annotations[selectedObject.i], k = L.findIndex(q => q.id == selectedObject.id);
    L.unshift(...L.splice(k, 1));
    renderPageAnnotations(selectedObject.i);
};
function openShapeText(i, a) {
    commitTextChanges();
    const r = getPageElement(i).lastChild.getBoundingClientRect(), n = (a.txt || '').split('\n').length;
    textEditorSession = { i, id: a.id, sh: 1, s: a.s, x: a.x, by: a.y, w0: a.w * zoom };
    Object.assign(ti.style, { display: 'block', left: r.left + a.x * zoom + 'px', top: r.top + (a.y + a.h / 2 - a.s * .6 * n) * zoom + 'px', fontSize: a.s * zoom + 'px', color: a.tc, fontFamily: FONT_FAMILIES[a.f.k], fontWeight: a.f.b ? 700 : 400, fontStyle: a.f.i ? 'italic' : 'normal', background: 'transparent', textAlign: 'center' });
    ti.value = a.txt || '';
    ti.oninput();
    ti.focus();
}
async function loadPdfFormFields(i) {
    const pi = pageMetadata[i], an = await pi.p.getAnnotations({ intent: 'display' }), vp = pi.p.getViewport({ scale: 1 });
    pi.fl = an.filter(a => a.subtype == 'Widget' && a.fieldName && (a.fieldType == 'Tx' || a.fieldType == 'Ch' || (a.fieldType == 'Btn' && a.checkBox))).map(a => {
        const r = vp.convertToViewportRectangle(a.rect);
        return { n: a.fieldName, t: a.fieldType, x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]), v: a.fieldValue };
    });
    renderPageAnnotations(i);
}
const getPdfFormFieldValue = f => formValues[f.n] !== undefined ? formValues[f.n] : f.v;
function renderPdfFormFields(i) {
    const pi = pageMetadata[i];
    if (!pi.fr) {
        pi.fr = 1;
        loadPdfFormFields(i);
    }
    return (pi.fl || []).map((f, k) => {
        const v = getPdfFormFieldValue(f), ch = f.t == 'Btn' ? (v && v != 'Off' ? '\u2714' : '') : (Array.isArray(v) ? v[0] : v) || '';
        return `<g><rect class="fl" data-fl="${k}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" style="fill:${formValues[f.n] !== undefined ? '#fff' : ''}"/><text x="${f.x + 2}" y="${f.y + f.h * .72}" font-size="${Math.min(12, f.h * .7)}" fill="#111" pointer-events="none" font-family="Helvetica,Arial,sans-serif">${escapeSvgText(String(ch))}</text></g>`;
    }).join('');
}
function openPdfFormField(i, f) {
    if (f.t == 'Btn') {
        const v = getPdfFormFieldValue(f);
        pushUndoSnapshot();
        formValues[f.n] = !(v && v != 'Off');
        renderPageAnnotations(i);
        return;
    }
    commitTextChanges();
    const r = getPageElement(i).lastChild.getBoundingClientRect(), v = getPdfFormFieldValue(f), s = Math.min(12, f.h * .7);
    textEditorSession = { i, fd: f.n, x: f.x, by: f.y + f.h * .72, s, w0: f.w * zoom };
    Object.assign(ti.style, { display: 'block', left: r.left + f.x * zoom + 'px', top: r.top + f.y * zoom + 'px', fontSize: s * zoom + 'px', color: '#000', fontFamily: FONT_FAMILIES.h, fontWeight: 400, fontStyle: 'normal', background: '#fff', textAlign: 'left' });
    ti.value = Array.isArray(v) ? v[0] || '' : v || '';
    ti.oninput();
    ti.focus();
}
$('#mg').onclick = () => $('#mf').click();
$('#mf').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !documentBytes)
        return;
    try {
        const D = PDFLib.PDFDocument, A = await D.load(documentBytes, { ignoreEncryption: true }), B = await D.load(new Uint8Array(await f.arrayBuffer()), { ignoreEncryption: true }), n = A.getPageCount();
        (await A.copyPages(B, B.getPageIndices())).forEach(p => A.addPage(p));
        const nb = await A.save(), doc = await pdfjsLib.getDocument({ data: nb.slice() }).promise, L = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const p = await doc.getPage(i), v = p.getViewport({ scale: 1 });
            L.push({ p, w: v.width, h: v.height });
        }
        pageMetadata = L;
        documentBytes = nb;
        for (let i = n; i < L.length; i++)
            pageOrder.push(i);
        buildPageElements();
        renderPageThumbnails();
        refreshEditorUI();
        showToast(`Added ${L.length - n} page(s) at the end`);
    }
    catch (x) {
        showToast('Could not merge that PDF');
    }
};
let ufb = null;
const hasU = s => /[^\x20-\x7E\xA0-\xFF\n]/.test(s);
$('#lf').onclick = () => $('#ft').click();
$('#ft').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f)
        return;
    try {
        ufb = new Uint8Array(await f.arrayBuffer());
        const ff = new FontFace('UF', ufb.slice().buffer);
        await ff.load();
        document.fonts.add(ff);
        FONT_FAMILIES.h = 'Helvetica,Arial,UF,sans-serif';
        FONT_FAMILIES.t = "'Times New Roman',Times,UF,serif";
        FONT_FAMILIES.c = "'Courier New',Courier,UF,monospace";
        renderAllPageAnnotations();
        showToast('Font loaded: non-Latin text will use it');
    }
    catch (x) {
        ufb = null;
        showToast('Could not load that font');
    }
};
const openSessionDatabase = () => new Promise((r, j) => {
    const q = indexedDB.open('pdfstudio', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('s');
    q.onsuccess = () => r(q.result);
    q.onerror = j;
});
let ptm;
function scheduleSessionSave() {
    clearTimeout(ptm);
    ptm = setTimeout(async () => {
        if (!documentBytes)
            return;
        try {
            (await openSessionDatabase()).transaction('s', 'readwrite').objectStore('s').put({ bytes: documentBytes, fname: documentName, ann: annotations, del: deletedPageIndexes, ord: pageOrder, fv: formValues, imgs: imageAssets }, 'cur');
        }
        catch (e) { }
    }, 900);
}
const readSavedSession = async () => {
    const d = await openSessionDatabase();
    return new Promise(r => {
        const q = d.transaction('s').objectStore('s').get('cur');
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
    });
};
$('#rs').onclick = async (e) => {
    e.stopPropagation();
    const r = await readSavedSession();
    if (!r)
        return;
    await loadPdfDocument(new File([r.bytes], r.fname));
    annotations = r.ann;
    deletedPageIndexes = r.del;
    pageOrder = r.ord;
    formValues = r.fv || {};
    imageAssets = r.imgs || {};
    nextAnnotationId = 1 + Math.max(0, ...Object.values(annotations).flat().map(a => +a.id || 0));
    buildPageElements();
    refreshEditorUI();
    showToast('Restored your previous session');
};
readSavedSession().then(r => {
    if (r && r.bytes)
        $('#rs').hidden = false;
}).catch(() => { });
