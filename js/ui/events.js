// File inputs, drag-and-drop, and general keyboard events.

const pickFile = () => $('#f').click();
$('#open').onclick = pickFile;
$('#open2').onclick = pickFile;
$('#f').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    f && loadPdfDocument(f);
};
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    f && loadPdfDocument(f);
});
addEventListener('keydown', e => {
    if (e.target == ti || e.target.matches('input, textarea, select, [contenteditable]'))
        return;
    const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey;
    if (m && k == 'z') {
        e.preventDefault();
        $(e.shiftKey ? '#redo' : '#undo').click();
    }
    else if (m && (k == 'y' || (e.shiftKey && k == 'z'))) {
        e.preventDefault();
        $('#redo').click();
    }
    else if ((k == 'delete' || k == 'backspace') && selectedObject) {
        e.preventDefault();
        deleteSelectedObject();
    }
    else if (k == 'escape')
        selectObject(null);
});
addEventListener('resize', () => {
    if (documentBytes)
        renderAllPageAnnotations();
});
/* new landing, tool directory, inspector + shape controls */
