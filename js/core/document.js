// PDF loading, page rendering, and zoom control.

async function loadPdfDocument(file) {
    if (!window.pdfjsLib)
        return showToast('PDF engine failed to load — check connection');
    try {
        const buf = new Uint8Array(await file.arrayBuffer()), doc = await pdfjsLib.getDocument({ data: buf.slice() }).promise, L = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const p = await doc.getPage(i), v = p.getViewport({ scale: 1 });
            L.push({ p, w: v.width, h: v.height });
        }
        pageMetadata = L;
        documentBytes = buf;
        documentName = file.name || 'document.pdf';
        annotations = {};
        formValues = {};
        deletedPageIndexes = [];
        pageOrder = L.map((_, i) => i);
        Object.keys(thumbnailCache).forEach(k => delete thumbnailCache[k]);
        $('#th').hidden = true;
        imageAssets = {};
        undoHistory = [];
        redoHistory = [];
        selectedObject = null;
        nextAnnotationId = 1;
        zoom = Math.min(2, Math.max(.4, (view.clientWidth - 24) / pageMetadata[0].w));
        setZoom(zoom);
        view.scrollTop = 0;
        setTool('etext');
        refreshEditorUI();
    }
    catch (e) {
        showToast('Could not open that PDF');
    }
}
const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !e.target._r) {
        e.target._r = 1;
        renderPdfPage(e.target);
    }
}), { root: view, rootMargin: '800px 0px' });
async function renderPdfPage(w) {
    const pi = pageMetadata[w.dataset.i], c = w.firstChild, s = Math.min(zoom * (devicePixelRatio || 1), 3.5);
    c.width = Math.round(pi.w * s);
    c.height = Math.round(pi.h * s);
    try {
        await pi.p.render({ canvasContext: c.getContext('2d'), viewport: pi.p.getViewport({ scale: s }) }).promise;
    }
    catch (e) { }
}
function buildPageElements() {
    io.disconnect();
    box.innerHTML = '';
    pageOrder.forEach(i => {
        const pi = pageMetadata[i];
        if (deletedPageIndexes.includes(i))
            return;
        const w = document.createElement('div');
        w.className = 'pg';
        w.dataset.i = i;
        w.style.width = pi.w * zoom + 'px';
        w.style.height = pi.h * zoom + 'px';
        w.innerHTML = `<canvas></canvas><svg viewBox="0 0 ${pi.w} ${pi.h}"></svg>`;
        box.append(w);
        io.observe(w);
    });
    renderAllPageAnnotations();
    updateVisiblePage();
}
function setZoom(z) {
    if (!documentBytes)
        return;
    const r = view.scrollTop / (view.scrollHeight || 1);
    zoom = Math.min(4, Math.max(.4, z));
    buildPageElements();
    view.scrollTop = r * view.scrollHeight;
    $('#zl').textContent = Math.round(zoom * 100) + '%';
}
function updateVisiblePage() {
    const ws = [...box.children], c = view.getBoundingClientRect(), m = c.top + c.height / 2;
    let k = 0;
    ws.forEach((w, j) => {
        if (w.getBoundingClientRect().top <= m)
            k = j;
    });
    currentPageIndex = k;
    $('#pn').textContent = ws.length ? `${k + 1} / ${ws.length}` : '';
}
view.addEventListener('scroll', () => requestAnimationFrame(updateVisiblePage));
