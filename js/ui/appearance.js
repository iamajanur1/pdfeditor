// Shape fill, outline, and inspector behaviors.

function refreshAppearanceUI() {
    const f = $('#fc').value.toUpperCase(), o = $('#oc').value.toUpperCase();
    $('#fillHex').textContent = $('#fillEnabled').checked ? f : 'NONE';
    $('#outlineHex').textContent = $('#outlineEnabled').checked ? o : 'NONE';
    $('#owValue').textContent = $('#ow').value + ' px';
    $('#foValue').textContent = $('#fo').value + '%';
    const e = $('#livePreviewShape');
    if (!e)
        return;
    e.setAttribute('fill', $('#fillEnabled').checked ? f : 'none');
    e.setAttribute('stroke', $('#outlineEnabled').checked ? o : 'none');
    e.setAttribute('fill-opacity', +$('#fo').value / 100);
    e.setAttribute('stroke-width', Math.min(+$('#ow').value, 15));
    const n = +$('#ow').value;
    e.setAttribute('stroke-dasharray', $('#os').value == 'dashed' ? `${n * 4} ${n * 2}` : $('#os').value == 'dotted' ? `${n} ${n * 2}` : 'none');
    document.querySelectorAll('.shape-choice').forEach(b => b.classList.toggle('active', b.dataset.shape == $('#sk').value));
}
function shapeUpdate(key, value, oneShot = true) {
    const a = selectedObject && getSelectedObject();
    if (a && a.t == 'shp' && a[key] !== value) {
        // Capture history before changing properties without a UI rebuild mid-drag.
        if (oneShot || !shapeSlideActive) {
            undoHistory.push(getEditorSnapshot());
            if (undoHistory.length > 60)
                undoHistory.shift();
            redoHistory = [];
            shapeSlideActive = !oneShot;
            $('#undo').disabled = false;
            $('#redo').disabled = true;
        }
        a[key] = value;
        renderPageAnnotations(selectedObject.i);
        scheduleSessionSave();
        refreshInspector();
    }
    else
        refreshAppearanceUI();
}
let shapeSlideActive = false;
function shapeSlider(id, key, toValue) {
    const e = $('#' + id);
    e.addEventListener('input', () => shapeUpdate(key, toValue(e.value), false));
    e.addEventListener('change', () => shapeSlideActive = false);
    e.addEventListener('pointerup', () => shapeSlideActive = false);
}
$('#shapePresets').addEventListener('click', e => {
    const b = e.target.closest('[data-shape]');
    if (!b)
        return;
    $('#sk').value = b.dataset.shape;
    const a = selectedObject && getSelectedObject();
    if (a && a.t == 'shp') {
        pushUndoSnapshot();
        a.k = b.dataset.shape;
        renderPageAnnotations(selectedObject.i);
        scheduleSessionSave();
    }
    else if (documentBytes)
        setTool('shp');
    refreshAppearanceUI();
});
$('#fc').addEventListener('input', e => {
    $('#fillEnabled').checked = true;
    shapeUpdate('fill', e.target.value, false);
});
$('#oc').addEventListener('input', e => {
    $('#outlineEnabled').checked = true;
    shapeUpdate('c', e.target.value, false);
});
$('#fc').addEventListener('change', e => {
    $('#fillEnabled').checked = true;
    shapeUpdate('fill', e.target.value, false);
    shapeSlideActive = false;
});
$('#oc').addEventListener('change', e => {
    $('#outlineEnabled').checked = true;
    shapeUpdate('c', e.target.value, false);
    shapeSlideActive = false;
});
$('#fillEnabled').addEventListener('change', e => shapeUpdate('fill', e.target.checked ? $('#fc').value : 'none'));
$('#outlineEnabled').addEventListener('change', e => shapeUpdate('c', e.target.checked ? $('#oc').value : 'none'));
$('#fx').onclick = () => {
    $('#fillEnabled').checked = false;
    shapeUpdate('fill', 'none');
};
$('#ox').onclick = () => {
    $('#outlineEnabled').checked = false;
    shapeUpdate('c', 'none');
};
shapeSlider('ow', 'sw', Number);
shapeSlider('fo', 'fo', v => Number(v) / 100);
$('#os').onchange = e => shapeUpdate('dash', e.target.value);
$('#sz').addEventListener('input', () => $('#szValue').textContent = $('#sz').value + ' px');
function updateToolHint() {
    const m = { select: 'Click to select · drag to move · use the corner handle to resize', etext: 'Click existing PDF text to edit it', text: 'Click a spot on the page to add text', shp: 'Choose a shape and drag on the page to draw it', pen: 'Draw freehand directly on the page', hl: 'Drag over a region to highlight', box: 'Drag to make an outline box', form: 'Click a highlighted form field to fill it', red: 'Drag to cover private information', erase: 'Click an annotation to remove it', img: 'Insert an image on the page', sig: 'Add a handwritten signature' };
    $('#toolHint').textContent = selectedObject && getSelectedObject() ? 'Selected element · adjust its properties on the right' : m[tool] || 'Start editing your document';
}
$('#mobilePropertiesBtn').onclick = () => $('#inspector').classList.toggle('mobile-open');
$('#backHome').onclick = async () => {
    if (!confirm('Return to the home page? Your latest session is automatically saved in this browser.'))
        return;
    commitTextChanges();
    if (documentBytes) {
        try {
            const db = await openSessionDatabase();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('s', 'readwrite');
                tx.oncomplete = resolve;
                tx.onerror = reject;
                tx.objectStore('s').put({ bytes: documentBytes, fname: documentName, ann: annotations, del: deletedPageIndexes, ord: pageOrder, fv: formValues, imgs: imageAssets }, 'cur');
            });
        }
        catch (e) {
            console.warn('Could not save the home session:', e);
        }
    }
    documentBytes = null;
    pageMetadata = [];
    annotations = {};
    deletedPageIndexes = [];
    pageOrder = [];
    selectedObject = null;
    undoHistory = [];
    redoHistory = [];
    $('#th').hidden = true;
    box.innerHTML = '';
    $('#inspector').classList.remove('mobile-open');
    refreshEditorUI();
    view.scrollTop = 0;
    readSavedSession().then(r => $('#rs').hidden = !(r && r.bytes)).catch(() => { });
};
