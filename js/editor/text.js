// Inline text-area editing and change commits.

function openText(i, x, y, a) {
    commitTextChanges();
    const r = getPageElement(i).lastChild.getBoundingClientRect(), s = a ? a.s : 8 + size * 3, by = a ? a.y : y + s;
    textEditorSession = { i, id: a && a.id, x: a ? a.x : x, by, s };
    Object.assign(ti.style, { display: 'block', left: r.left + textEditorSession.x * zoom + 'px', top: r.top + (by - .945 * s) * zoom + 'px', fontSize: s * zoom + 'px', color: a ? a.c : color, fontFamily: FONT_FAMILIES.h, fontWeight: 400, fontStyle: 'normal', background: '#fffe' });
    ti.value = a ? a.txt : '';
    ti.oninput();
    ti.focus();
}
ti.oninput = () => {
    const L = ti.value.split('\n');
    ti.style.height = L.length * textEditorSession.s * zoom * 1.2 + 4 + 'px';
    ti.style.width = Math.max(textEditorSession.w0 || 80, Math.max(...L.map(l => l.length)) * textEditorSession.s * zoom * .6 + 16) + 'px';
};
function commitTextChanges() {
    if (!textEditorSession)
        return;
    const t = textEditorSession, v = ti.value;
    textEditorSession = null;
    ti.style.display = 'none';
    if (t.fd) {
        if (v != (formValues[t.fd] || '')) {
            pushUndoSnapshot();
            formValues[t.fd] = v;
        }
        renderPageAnnotations(t.i);
        return;
    }
    if (t.sh) {
        const a = (annotations[t.i] || []).find(q => q.id == t.id);
        if (a && v != (a.txt || '')) {
            pushUndoSnapshot();
            a.txt = v;
        }
        renderPageAnnotations(t.i);
        return;
    }
    if (t.ed) {
        const e = t.ed;
        if (e.id) {
            if (v == e.orig) {
                pushUndoSnapshot();
                annotations[t.i] = annotations[t.i].filter(q => q.id != e.id);
            }
            else if (v != e.txt) {
                pushUndoSnapshot();
                e.txt = v;
            }
        }
        else if (v != e.orig) {
            pushUndoSnapshot();
            e.id = nextAnnotationId++;
            e.txt = v;
            (annotations[t.i] = annotations[t.i] || []).push(e);
        }
        renderPageAnnotations(t.i);
        refreshEditorUI();
        return;
    }
    const L = annotations[t.i] = annotations[t.i] || [], a = t.id && L.find(q => q.id == t.id);
    if (a) {
        pushUndoSnapshot();
        if (v.trim())
            a.txt = v;
        else
            annotations[t.i] = L.filter(q => q != a);
    }
    else if (v.trim()) {
        pushUndoSnapshot();
        L.push({ id: nextAnnotationId++, t: 'text', x: t.x, y: t.by, s: t.s, c: color, txt: v, f: { k: 'h', b: 0, i: 0 } });
    }
    renderPageAnnotations(t.i);
    refreshEditorUI();
}
ti.onblur = commitTextChanges;
ti.onkeydown = e => {
    if (e.key == 'Escape') {
        textEditorSession = null;
        ti.style.display = 'none';
    }
    else if (e.key == 'Enter' && (e.ctrlKey || e.metaKey))
        ti.blur();
};
