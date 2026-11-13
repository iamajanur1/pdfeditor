// Tool selection, object selection, and deletion.

const highlightSelectedColor = () => document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() == color.toLowerCase()));
function selectObject(s) {
    const o = selectedObject;
    selectedObject = s;
    if (o)
        renderPageAnnotations(o.i);
    if (s) {
        renderPageAnnotations(s.i);
        const a = getSelectedObject();
        if (a) {
            if (a.c && a.c != 'none') {
                color = a.c;
                $('#cc').value = color;
            }
            if (a.sw)
                size = a.sw;
            else if (a.s)
                size = Math.max(1, Math.round((a.s - 8) / 3));
            $('#sz').value = Math.min(12, size);
            highlightSelectedColor();
        }
    }
    refreshEditorUI();
}
function setTool(t) {
    commitTextChanges();
    tool = t;
    document.body.dataset.tool = t;
    document.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t == t));
    if (t != 'select')
        selectedObject = null;
    if (t == 'hl')
        setColor('#ffeb3b');
    renderAllPageAnnotations();
    refreshEditorUI();
    if (window.innerWidth <= 590 && t == 'shp')
        $('#inspector').classList.add('mobile-open');
}
function setColor(c) {
    color = c;
    $('#cc').value = c;
    const a = selectedObject && getSelectedObject();
    if (a && a.t != 'img') {
        pushUndoSnapshot();
        a.c = c;
        renderPageAnnotations(selectedObject.i);
    }
    highlightSelectedColor();
}
function deleteSelectedObject() {
    const a = getSelectedObject();
    if (!a)
        return;
    pushUndoSnapshot();
    const i = selectedObject.i;
    annotations[i] = annotations[i].filter(q => q.id != a.id);
    selectedObject = null;
    renderPageAnnotations(i);
    refreshEditorUI();
}
$('#sw').innerHTML = COLOR_PALETTE.map(c => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
$('#dock').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) {
        const t = b.dataset.t;
        if (t == 'img')
            $('#fi').click();
        else if (t == 'sig')
            openSignatureDialog();
        else
            setTool(t);
    }
    const s = e.target.closest('[data-c]');
    if (s)
        setColor(s.dataset.c);
});
$('#cc').onchange = e => setColor(e.target.value);
$('#sz').oninput = e => {
    size = +e.target.value;
    const a = selectedObject && getSelectedObject();
    if (a && a.t != 'img' && a.t != 'hl' && a.t != 'edit') {
        if (!strokeResizeActive) {
            pushUndoSnapshot();
            strokeResizeActive = 1;
        }
        if (a.t == 'text')
            a.s = 8 + size * 3;
        else
            a.sw = size;
        renderPageAnnotations(selectedObject.i);
    }
};
$('#sz').onchange = () => strokeResizeActive = 0;
$('#del').onclick = deleteSelectedObject;
$('#zi').onclick = () => setZoom(zoom * 1.25);
$('#zo').onclick = () => setZoom(zoom / 1.25);
$('#dp').onclick = () => {
    const w = box.children[currentPageIndex];
    if (!w)
        return;
    if (box.children.length < 2)
        return showToast('A PDF needs at least one page');
    pushUndoSnapshot();
    deletedPageIndexes.push(+w.dataset.i);
    selectedObject = null;
    buildPageElements();
    renderPageThumbnails();
    refreshEditorUI();
};
