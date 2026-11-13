// Image selection and insertion.

$('#fi').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !documentBytes)
        return;
    const u = URL.createObjectURL(f), im = new Image();
    im.onerror = () => showToast('Could not read that image');
    im.onload = () => {
        const sc = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * sc);
        c.height = Math.round(im.height * sc);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        const id = nextAnnotationId++, k = 'i' + id, w = box.children[currentPageIndex], i = +w.dataset.i, pw = pageMetadata[i].w * .4;
        imageAssets[k] = c.toDataURL('image/png');
        pushUndoSnapshot();
        const top = Math.max(20, (view.getBoundingClientRect().top - w.getBoundingClientRect().top) / zoom + 60);
        (annotations[i] = annotations[i] || []).push({ id, t: 'img', img: k, x: pageMetadata[i].w * .3, y: top, w: pw, h: pw * c.height / c.width });
        setTool('select');
        selectObject({ i, id });
    };
    im.src = u;
};
