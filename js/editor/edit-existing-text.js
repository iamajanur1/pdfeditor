// Extracting and reconstructing existing PDF text.

function getEditableTextRegions(i) {
    const pi = pageMetadata[i];
    if (!pi.tr) {
        pi.tr = 1;
        loadEditableTextRegions(i);
    }
    const sk = new Set((annotations[i] || []).filter(a => a.t == 'edit').map(a => a.li));
    return (pi.tl || []).map((l, k) => sk.has(k) ? '' : `<rect class="el" data-tl="${k}" x="${l.cv.x}" y="${l.cv.y}" width="${l.cv.w}" height="${l.cv.h}"/>`).join('');
}
async function loadEditableTextRegions(i) {
    const pi = pageMetadata[i], tc = await pi.p.getTextContent(), vp = pi.p.getViewport({ scale: 1 }), R = [];
    for (const it of tc.items) {
        if (!it.str)
            continue;
        const t = pdfjsLib.Util.transform(vp.transform, it.transform), s = Math.hypot(t[2], t[3]);
        if (Math.abs(t[1]) > .01 || s < 2)
            continue;
        const l = R[R.length - 1], x = t[4], y = t[5], g = l ? x - (l.x + l.w) : 0;
        if (l && l.fn == it.fontName && Math.abs(l.y - y) < s * .25 && Math.abs(l.s - s) < s * .1 && g > -s * .5 && g < s * 1.5) {
            l.str += (g > s * .2 && !/\s$/.test(l.str) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
            l.w = x + it.width - l.x;
        }
        else
            R.push({ x, y, w: it.width, s, fn: it.fontName, str: it.str });
    }
    const st = tc.styles;
    pi.tl = R.filter(l => l.str.trim()).map((l, k) => {
        const d = st[l.fn] || {}, as = Math.min(d.ascent || .9, .95), ds = Math.max(d.descent || -.2, -.25);
        l.str = l.str.replace(/\s+$/, '');
        l.k = k;
        l.cv = { x: l.x - 1, y: l.y - l.s * as - .5, w: l.w + 2, h: l.s * (as - ds) + 1 };
        return l;
    });
    pi.st = st;
    renderPageAnnotations(i);
}
function lstyle(i, l) {
    const pi = pageMetadata[i];
    let f;
    try {
        f = pi.p.commonObjs.get(l.fn);
    }
    catch (e) { }
    const n = ((f && f.name) || '') + ' ' + ((pi.st[l.fn] || {}).fontFamily || ''), sans = /sans|arial|helvet|calibri|verdana|tahoma/i.test(n);
    const k = (f && f.isMonospace) || /courier|mono|consol/i.test(n) ? 'c' : !sans && ((f && f.isSerifFont) || /times|serif|georgia|garamond|minion|cambria|palatino|book/i.test(n)) ? 't' : 'h';
    return { k, b: !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demi/i.test(n), i: !!(f && f.italic) || /italic|oblique/i.test(n) };
}
function lcol(i, l) {
    const c = getPageElement(i).firstChild, s = c.width / pageMetadata[i].w, x = Math.max(0, l.cv.x * s | 0), y = Math.max(0, l.cv.y * s | 0), w = Math.max(1, Math.min(c.width - x, l.cv.w * s | 0)), h = Math.max(1, Math.min(c.height - y, l.cv.h * s | 0)), D = { bg: '#ffffff', c: '#000000' };
    let d;
    try {
        d = c.getContext('2d').getImageData(x, y, w, h).data;
    }
    catch (e) {
        return D;
    }
    const m = {};
    let bk = 0, bn = 0;
    for (let j = 0; j < d.length; j += 4) {
        const k = (d[j] >> 4) << 8 | (d[j + 1] >> 4) << 4 | d[j + 2] >> 4, n = m[k] = (m[k] || 0) + 1;
        if (n > bn) {
            bn = n;
            bk = j;
        }
    }
    if (!d[bk + 3])
        return D;
    const B = [d[bk], d[bk + 1], d[bk + 2]];
    let fd = -1, fc = B;
    for (let j = 0; j < d.length; j += 4) {
        const q = (d[j] - B[0]) ** 2 + (d[j + 1] - B[1]) ** 2 + (d[j + 2] - B[2]) ** 2;
        if (q > fd) {
            fd = q;
            fc = [d[j], d[j + 1], d[j + 2]];
        }
    }
    const H = a => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
    return { bg: H(B), c: H(fc) };
}
function openExistingTextEditor(i, a, l) {
    commitTextChanges();
    const r = getPageElement(i).lastChild.getBoundingClientRect();
    if (!a) {
        const q = lcol(i, l);
        a = { t: 'edit', x: l.x, y: l.y, s: l.s, c: q.c, bg: q.bg, f: lstyle(i, l), cv: l.cv, orig: l.str, txt: l.str, li: l.k };
    }
    textEditorSession = { i, ed: a, id: a.id, x: a.x, by: a.y, s: a.s, w0: a.cv.w * zoom + 10 };
    Object.assign(ti.style, { display: 'block', left: r.left + a.x * zoom + 'px', top: r.top + (a.y - .945 * a.s) * zoom + 'px', fontSize: a.s * zoom + 'px', color: a.c, fontFamily: FONT_FAMILIES[a.f.k], fontWeight: a.f.b ? 700 : 400, fontStyle: a.f.i ? 'italic' : 'normal', background: a.bg });
    ti.value = a.txt;
    ti.oninput();
    ti.focus();
}
