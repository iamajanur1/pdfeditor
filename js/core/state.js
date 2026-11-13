// Undo/redo snapshots and editor status updates.

const getEditorSnapshot = () => JSON.stringify({ a: annotations, d: deletedPageIndexes, o: pageOrder, v: formValues });
function pushUndoSnapshot() {
    undoHistory.push(getEditorSnapshot());
    if (undoHistory.length > 60)
        undoHistory.shift();
    redoHistory = [];
    refreshEditorUI();
}
function restoreSnapshot(s) {
    const o = JSON.parse(s), rb = JSON.stringify([o.d, o.o]) != JSON.stringify([deletedPageIndexes, pageOrder]);
    annotations = o.a;
    deletedPageIndexes = o.d;
    pageOrder = o.o;
    formValues = o.v || {};
    selectedObject = null;
    rb ? (buildPageElements(), renderPageThumbnails()) : renderAllPageAnnotations();
    refreshEditorUI();
}
$('#undo').onclick = () => {
    if (!undoHistory.length)
        return;
    redoHistory.push(getEditorSnapshot());
    restoreSnapshot(undoHistory.pop());
};
$('#redo').onclick = () => {
    if (!redoHistory.length)
        return;
    undoHistory.push(getEditorSnapshot());
    restoreSnapshot(redoHistory.pop());
};
function refreshEditorUI() {
    $('#undo').disabled = !undoHistory.length;
    $('#redo').disabled = !redoHistory.length;
    $('#save').disabled = !documentBytes;
    $('#empty').hidden = !!documentBytes;
    document.body.classList.toggle('has', !!documentBytes);
    $('#fileName').textContent = documentName;
    refreshInspector();
    scheduleSessionSave();
    $('#del').disabled = !selectedObject;
    $('#dp').disabled = !documentBytes;
    updateToolHint();
}
