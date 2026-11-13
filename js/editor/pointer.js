// Drawing, dragging, resizing, and touch gestures.

const getPointerLocations = () => [...pointerLocations.values()], getGestureDistance = () => {
    const [a, b] = getPointerLocations();
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
}, getGestureMidpoint = () => {
    const [a, b] = getPointerLocations();
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};
function cancelPointerOperation() {
    if (currentAnnotation || dragState) {
        currentAnnotation = dragState = null;
        if (undoHistory.length)
            restoreSnapshot(undoHistory.pop());
    }
    pendingTextPlacement = pendingTextTarget = null;
}
function updatePinchGesture() {
    if (pointerLocations.size < 2)
        return;
    const m = getGestureMidpoint();
    view.scrollLeft -= m[0] - pinchGesture.m[0];
    view.scrollTop -= m[1] - pinchGesture.m[1];
    pinchGesture.m = m;
    pinchGesture.z = getGestureDistance() / pinchGesture.d;
    box.style.transform = `scale(${pinchGesture.z})`;
}
function finishPinchGesture() {
    const z = pinchGesture.z;
    pinchGesture = null;
    box.style.transform = '';
    if (Math.abs(z - 1) > .06)
        setZoom(zoom * z);
}
box.addEventListener('pointerdown', e => {
    pointerLocations.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointerLocations.size == 2) {
        cancelPointerOperation();
        pinchGesture = { d: getGestureDistance(), m: getGestureMidpoint(), z: 1 };
        return;
    }
    if (pointerLocations.size > 2 || pinchGesture)
        return;
    const w = e.target.closest('.pg');
    if (!w) {
        if (tool == 'select')
            selectObject(null);
        return;
    }
    try {
        w.lastChild.setPointerCapture(e.pointerId);
    }
    catch (_) { }
    const i = +w.dataset.i, [x, y] = getPagePointerPosition(e, w), d = e.target.closest('[data-id]');
    if (tool == 'pen' || tool == 'hl' || tool == 'box' || tool == 'red' || tool == 'shp') {
        pushUndoSnapshot();
        const a = { id: nextAnnotationId++, t: tool, c: color, sw: size };
        if (tool == 'pen')
            a.p = [[x, y], [x, y]];
        else
            Object.assign(a, { x, y, w: 0, h: 0 });
        if (tool == 'shp')
            Object.assign(a, { k: $('#sk').value, c: $('#outlineEnabled').checked ? $('#oc').value : 'none', sw: +$('#ow').value, fill: $('#fillEnabled').checked ? $('#fc').value : 'none', fo: +$('#fo').value / 100, dash: $('#os').value, s: 16, tc: $('#tc').value, f: { k: 'h', b: 0, i: 0 } });
        (annotations[i] = annotations[i] || []).push(a);
        currentAnnotation = { a, i, x, y };
        renderPageAnnotations(i);
    }
    else if (tool == 'erase') {
        if (d) {
            pushUndoSnapshot();
            annotations[i] = annotations[i].filter(q => q.id != d.dataset.id);
            renderPageAnnotations(i);
        }
    }
    else if (tool == 'etext') {
        const a = d && (annotations[i] || []).find(q => q.id == d.dataset.id), tl = e.target.closest('[data-tl]');
        pendingTextTarget = a && a.t == 'edit' ? { i, a, cx: e.clientX, cy: e.clientY } : tl ? { i, k: +tl.dataset.tl, cx: e.clientX, cy: e.clientY } : null;
    }
    else if (tool == 'form') {
        const fl = e.target.closest('[data-fl]');
        pendingTextTarget = fl ? { i, fk: +fl.dataset.fl, cx: e.clientX, cy: e.clientY } : null;
    }
    else if (tool == 'text') {
        const a = d && (annotations[i] || []).find(q => q.id == d.dataset.id);
        pendingTextPlacement = { i, x, y, a: a && a.t == 'text' ? a : null, cx: e.clientX, cy: e.clientY };
    }
    else if (e.target.closest('[data-h]') && selectedObject) {
        pushUndoSnapshot();
        dragState = { m: 'r', sx: e.clientX, sy: e.clientY, o: structuredClone(getSelectedObject()), mv: 0 };
    }
    else if (d) {
        const id = +d.dataset.id, was = selectedObject && selectedObject.id == id;
        selectObject({ i, id });
        pushUndoSnapshot();
        dragState = { m: 'm', sx: e.clientX, sy: e.clientY, o: structuredClone(getSelectedObject()), was, mv: 0 };
    }
    else
        selectObject(null);
});
box.addEventListener('pointermove', e => {
    if (pointerLocations.has(e.pointerId))
        pointerLocations.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinchGesture) {
        updatePinchGesture();
        return;
    }
    if (currentAnnotation) {
        const w = getPageElement(currentAnnotation.i), a = currentAnnotation.a;
        if (a.t == 'pen') {
            for (const c of (e.getCoalescedEvents?.() || [e])) {
                const [x, y] = getPagePointerPosition(c, w), l = a.p[a.p.length - 1];
                if (Math.hypot(x - l[0], y - l[1]) >= .8)
                    a.p.push([x, y]);
            }
        }
        else {
            const [x, y] = getPagePointerPosition(e, w);
            Object.assign(a, { x: Math.min(x, currentAnnotation.x), y: Math.min(y, currentAnnotation.y), w: Math.abs(x - currentAnnotation.x), h: Math.abs(y - currentAnnotation.y) });
        }
        renderPageAnnotations(currentAnnotation.i);
    }
    else if (dragState) {
        const dx = (e.clientX - dragState.sx) / zoom, dy = (e.clientY - dragState.sy) / zoom;
        if (!dragState.mv && Math.hypot(dx, dy) * zoom < 4)
            return;
        dragState.mv = 1;
        const a = getSelectedObject(), o = dragState.o;
        if (!a)
            return;
        if (dragState.m == 'm') {
            if (a.t == 'edit') { }
            else if (a.t == 'pen')
                a.p = o.p.map(q => [q[0] + dx, q[1] + dy]);
            else {
                a.x = o.x + dx;
                a.y = o.y + dy;
            }
        }
        else {
            a.w = Math.max(8, o.w + dx);
            a.h = a.t == 'img' ? a.w * o.h / o.w : Math.max(8, o.h + dy);
        }
        renderPageAnnotations(selectedObject.i);
    }
    else {
        if (pendingTextPlacement && Math.hypot(e.clientX - pendingTextPlacement.cx, e.clientY - pendingTextPlacement.cy) > 8)
            pendingTextPlacement = null;
        if (pendingTextTarget && Math.hypot(e.clientX - pendingTextTarget.cx, e.clientY - pendingTextTarget.cy) > 8)
            pendingTextTarget = null;
    }
});
function end(e) {
    pointerLocations.delete(e.pointerId);
    if (pinchGesture) {
        if (pointerLocations.size < 2)
            finishPinchGesture();
        return;
    }
    if (currentAnnotation) {
        const { a, i } = currentAnnotation;
        currentAnnotation = null;
        if (a.t != 'pen' && a.w < 3 && a.h < 3) {
            annotations[i].pop();
            undoHistory.pop();
        }
        else if (a.t == 'shp') {
            setTool('select');
            selectObject({ i, id: a.id });
            showToast('Tap the shape again to type inside it');
        }
        renderPageAnnotations(i);
        refreshEditorUI();
    }
    else if (dragState) {
        if (!dragState.mv) {
            undoHistory.pop();
            const a = getSelectedObject();
            if (dragState.was && dragState.m == 'm' && a && a.t == 'text')
                openText(selectedObject.i, 0, 0, a);
            else if (dragState.was && a && a.t == 'edit')
                openExistingTextEditor(selectedObject.i, a);
            else if (dragState.was && a && a.t == 'shp')
                openShapeText(selectedObject.i, a);
        }
        dragState = null;
        refreshEditorUI();
    }
}
box.addEventListener('pointerup', end);
box.addEventListener('pointercancel', e => {
    if (!pinchGesture)
        cancelPointerOperation();
    end(e);
});
box.addEventListener('click', () => {
    if (tool == 'form' && pendingTextTarget) {
        const t = pendingTextTarget;
        pendingTextTarget = null;
        openPdfFormField(t.i, pageMetadata[t.i].fl[t.fk]);
    }
    if (tool == 'etext' && pendingTextTarget) {
        const t = pendingTextTarget;
        pendingTextTarget = null;
        openExistingTextEditor(t.i, t.a, t.a ? null : pageMetadata[t.i].tl[t.k]);
    }
    if (tool == 'text' && pendingTextPlacement) {
        const t = pendingTextPlacement;
        pendingTextPlacement = null;
        openText(t.i, t.x, t.y, t.a);
    }
});
view.addEventListener('wheel', e => {
    if (!e.ctrlKey)
        return;
    e.preventDefault();
    clearTimeout(wheelZoomTimer);
    wheelZoomScale *= Math.exp(-e.deltaY * .01);
    box.style.transform = `scale(${wheelZoomScale})`;
    wheelZoomTimer = setTimeout(() => {
        const z = wheelZoomScale;
        wheelZoomScale = 1;
        box.style.transform = '';
        setZoom(zoom * z);
    }, 160);
}, { passive: false });
