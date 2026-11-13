// Page thumbnails, text search, and signature capture.

const thumbnailCache = {};
let searchMatches = [], activeSearchIndex = -1;
async function renderPageThumbnails() {
    const P = $('#th');
    if (P.hidden)
        return;
    const L = pageOrder.filter(i => !deletedPageIndexes.includes(i));
    P.innerHTML = '';
    for (const [n, i] of L.entries()) {
        const d = document.createElement('div');
        d.className = 'tb';
        d.dataset.i = i;
        d.innerHTML = `<img alt=""><span>${n + 1}</span><div><button data-m="-1">◀</button><button data-m="1">▶</button><button data-m="0">🗑</button></div>`;
        P.append(d);
        if (!thumbnailCache[i]) {
            const pi = pageMetadata[i], c = document.createElement('canvas'), vp = pi.p.getViewport({ scale: 140 / pi.w });
            c.width = vp.width;
            c.height = vp.height;
            await pi.p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            thumbnailCache[i] = c.toDataURL();
        }
        d.firstChild.src = thumbnailCache[i];
    }
}
$('#pgs').onclick = () => {
    const P = $('#th');
    P.hidden = !P.hidden;
    renderPageThumbnails();
};
$('#th').addEventListener('click', e => {
    const d = e.target.closest('.tb');
    if (!d)
        return;
    const i = +d.dataset.i, b = e.target.closest('[data-m]');
    if (!b) {
        const w = getPageElement(i);
        w && w.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const m = +b.dataset.m, vis = pageOrder.filter(x => !deletedPageIndexes.includes(x)), j = vis[vis.indexOf(i) + m];
    if (m == 0) {
        if (vis.length < 2)
            return showToast('A PDF needs at least one page');
        pushUndoSnapshot();
        deletedPageIndexes.push(i);
    }
    else {
        if (j == null)
            return;
        pushUndoSnapshot();
        const a = pageOrder.indexOf(i), c = pageOrder.indexOf(j);
        [pageOrder[a], pageOrder[c]] = [pageOrder[c], pageOrder[a]];
    }
    selectedObject = null;
    buildPageElements();
    renderPageThumbnails();
    refreshEditorUI();
});
const renderSearchHighlights = i => searchMatches.filter(h => h.i == i).map(h => `<rect x="${h.l.x + h.l.w * h.f}" y="${h.l.cv.y}" width="${h.l.w * h.g}" height="${h.l.cv.h}" fill="${h === searchMatches[activeSearchIndex] ? '#ff9800' : '#ffeb3b'}" opacity=".5" pointer-events="none"/>`).join('');
async function search() {
    const q = $('#q').value.trim().toLowerCase();
    if (!q || !documentBytes)
        return;
    if (searchMatches.q != q) {
        searchMatches = [];
        searchMatches.q = q;
        activeSearchIndex = -1;
        for (const i of pageOrder) {
            if (deletedPageIndexes.includes(i))
                continue;
            const pi = pageMetadata[i];
            if (!pi.tl) {
                pi.tr = 1;
                await loadEditableTextRegions(i);
            }
            pi.tl.forEach(l => {
                const k = l.str.toLowerCase().indexOf(q);
                if (k >= 0)
                    searchMatches.push({ i, l, f: k / l.str.length, g: q.length / l.str.length });
            });
        }
    }
    if (!searchMatches.length)
        return showToast('No matches');
    activeSearchIndex = (activeSearchIndex + 1) % searchMatches.length;
    renderAllPageAnnotations();
    showToast(`${activeSearchIndex + 1} of ${searchMatches.length}`);
    const w = getPageElement(searchMatches[activeSearchIndex].i);
    w && w.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
$('#q').addEventListener('keydown', e => {
    if (e.key == 'Enter')
        search();
});
$('#qn').onclick = search;
$('#q').oninput = () => {
    searchMatches = [];
    activeSearchIndex = -1;
    renderAllPageAnnotations();
};
const sc = $('#sc'), sx = sc.getContext('2d');
let sd = 0;
sc.style.touchAction = 'none';
const sp = e => {
    const r = sc.getBoundingClientRect();
    return [(e.clientX - r.left) * 560 / r.width, (e.clientY - r.top) * 220 / r.height];
};
function openSignatureDialog() {
    $('#sg').hidden = false;
    sx.clearRect(0, 0, 560, 220);
}
sc.addEventListener('pointerdown', e => {
    sd = 1;
    sc.setPointerCapture(e.pointerId);
    const [x, y] = sp(e);
    sx.beginPath();
    sx.moveTo(x, y);
    sx.lineTo(x + .1, y);
});
sc.addEventListener('pointermove', e => {
    if (!sd)
        return;
    const [x, y] = sp(e);
    sx.lineWidth = 3.5;
    sx.lineCap = sx.lineJoin = 'round';
    sx.strokeStyle = '#111';
    sx.lineTo(x, y);
    sx.stroke();
});
sc.addEventListener('pointerup', () => sd = 0);
$('#sx').onclick = () => sx.clearRect(0, 0, 560, 220);
$('#sigCancel').onclick = () => $('#sg').hidden = true;
$('#su').onclick = () => {
    const d = sx.getImageData(0, 0, 560, 220).data;
    let x0 = 560, y0 = 220, x1 = -1, y1 = -1;
    for (let y = 0; y < 220; y++)
        for (let x = 0; x < 560; x++)
            if (d[(y * 560 + x) * 4 + 3]) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
    if (x1 < 0)
        return showToast('Draw your signature first');
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 8;
    c.height = y1 - y0 + 8;
    c.getContext('2d').drawImage(sc, x0 - 4, y0 - 4, c.width, c.height, 0, 0, c.width, c.height);
    const id = nextAnnotationId++, k = 'i' + id, w = box.children[currentPageIndex], i = +w.dataset.i, pw = Math.min(pageMetadata[i].w * .3, c.width), top = Math.max(20, (view.getBoundingClientRect().top - w.getBoundingClientRect().top) / zoom + 60);
    imageAssets[k] = c.toDataURL('image/png');
    pushUndoSnapshot();
    (annotations[i] = annotations[i] || []).push({ id, t: 'img', img: k, x: pageMetadata[i].w * .3, y: top, w: pw, h: pw * c.height / c.width });
    $('#sg').hidden = true;
    setTool('select');
    selectObject({ i, id });
};
['dragenter', 'dragover'].forEach(v => $('#drop').addEventListener(v, () => $('#drop').classList.add('ov')));
['dragleave', 'drop'].forEach(v => $('#drop').addEventListener(v, () => $('#drop').classList.remove('ov')));
$('#drop').onclick = e => {
    if (e.target.closest('#rs'))
        return;
    if (e.target.id != 'open2')
        $('#f').click();
};
